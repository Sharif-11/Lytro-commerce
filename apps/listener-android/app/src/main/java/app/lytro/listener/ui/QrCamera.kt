package app.lytro.listener.ui

import android.content.Context
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.ReaderException
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.Future

private val HINTS = mapOf(DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE))

/** LISTENER-APP-DESIGN 6: reading a QR with no Google Play services. What the code says, from a greyscale picture. */
fun readQr(luminance: ByteArray, rowStride: Int, width: Int, height: Int): String? = try {
    val source = PlanarYUVLuminanceSource(luminance, rowStride, height, 0, 0, width, height, false)
    QRCodeReader().decode(BinaryBitmap(HybridBinarizer(source)), HINTS).text
} catch (_: ReaderException) {
    null
}

/** The camera's picture, reporting anything it reads as a QR. */
@Composable
fun QrCamera(modifier: Modifier, onRead: (String) -> Unit) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val latest by rememberUpdatedState(onRead)
    val preview = remember { PreviewView(context).apply { scaleType = PreviewView.ScaleType.FILL_CENTER } }
    AndroidView({ preview }, modifier)
    DisposableEffect(owner) {
        val executor = Executors.newSingleThreadExecutor()
        val future = ProcessCameraProvider.getInstance(context)
        var bound: ProcessCameraProvider? = null
        future.addListener(
            {
                bound = providerOf(future)
                bound?.let { bind(context, owner, it, preview, executor) { read -> latest(read) } }
            },
            ContextCompat.getMainExecutor(context),
        )
        onDispose {
            bound?.unbindAll()
            executor.shutdown()
        }
    }
}

/** A phone whose camera will not start still pairs by typing the code. */
private fun providerOf(future: Future<ProcessCameraProvider>): ProcessCameraProvider? = try {
    future.get()
} catch (error: ExecutionException) {
    Log.w("QrCamera", "the camera would not start: ${error.javaClass.simpleName}")
    null
}

private fun bind(
    context: Context,
    owner: LifecycleOwner,
    provider: ProcessCameraProvider,
    view: PreviewView,
    executor: Executor,
    onRead: (String) -> Unit,
) {
    val preview = Preview.Builder().build().also { it.surfaceProvider = view.surfaceProvider }
    val analysis = ImageAnalysis.Builder()
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .build()
    analysis.setAnalyzer(executor) { image ->
        val read = image.use { readQrOf(it) }
        if (read != null) ContextCompat.getMainExecutor(context).execute { onRead(read) }
    }
    try {
        provider.unbindAll()
        provider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
    } catch (error: IllegalArgumentException) {
        // No back camera: typing the code still works.
        Log.w("QrCamera", "no camera to use: ${error.javaClass.simpleName}")
    } catch (error: IllegalStateException) {
        Log.w("QrCamera", "the camera could not be bound: ${error.javaClass.simpleName}")
    }
}

private fun readQrOf(image: ImageProxy): String? {
    val plane = image.planes[0]
    val bytes = ByteArray(plane.buffer.remaining()).also { plane.buffer.get(it) }
    return readQr(bytes, plane.rowStride, image.width, image.height)
}
