package app.lytro.listener.net

import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** What a call after pairing names (LSN-11): the device's token and this installation. */
data class DeviceCredentials(val token: String, val installationId: String)

private val JSON_TYPE = "application/json".toMediaType()

internal val apiJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
}

/**
 * LSN-01 to LSN-03, LSN-13, LSN-18, LSN-24: the app's calls on the API host, each in the app's language, so a refusal's
 * words come from the server's one list of them. No SMS text is ever logged here or anywhere else.
 */
class ListenerApi(
    private val client: OkHttpClient,
    private val baseUrl: String,
    private val hostHeader: String,
    private val appVersion: String,
    private val language: () -> String,
    private val credentials: () -> DeviceCredentials?,
) {
    suspend fun pair(request: PairRequest): ApiResult<Paired> =
        post("pair", apiJson.encodeToString(PairRequest.serializer(), request), Paired.serializer(), signed = false)

    suspend fun heartbeat(): ApiResult<Connected> = post("heartbeat", "{}", Connected.serializer())

    suspend fun upload(messages: List<UploadMessage>): ApiResult<Uploaded> =
        post("messages", uploadBodyOf(messages), Uploaded.serializer())

    /** LSN-04: from the paired phone, which would hear the dashboard up to [15] minutes late. */
    suspend fun startTestMode(): ApiResult<TestModeStarted> =
        post("test-mode", "{}", TestModeStarted.serializer())

    suspend fun recent(limit: Int): ApiResult<Recent> =
        send(request("messages?limit=$limit", signed = true).get().build(), Recent.serializer())

    suspend fun unpair(): ApiResult<JsonObject> = post("unpair", "{}", JsonObject.serializer())

    /** D8-74: Lytro's help line, read when the app opens. No token: a phone that can't pair needs it most. */
    suspend fun helpLine(): ApiResult<HelpLine> =
        send(request("help-line", signed = false).get().build(), HelpLine.serializer())

    private suspend fun <T> post(
        path: String,
        body: String,
        answer: KSerializer<T>,
        signed: Boolean = true,
    ): ApiResult<T> =
        send(request(path, signed).post(body.toRequestBody(JSON_TYPE)).build(), answer)

    private fun request(path: String, signed: Boolean): Request.Builder {
        val builder = Request.Builder()
            .url(baseUrl + path)
            .header("Accept-Language", language())
            .header("x-app-version", appVersion)
        if (hostHeader.isNotEmpty()) builder.header("Host", hostHeader)
        if (signed) {
            credentials()?.let {
                builder.header("Authorization", "Bearer ${it.token}")
                builder.header("x-installation-id", it.installationId)
            }
        }
        return builder
    }

    private suspend fun <T> send(request: Request, answer: KSerializer<T>): ApiResult<T> =
        withContext(Dispatchers.IO) {
            try {
                client.newCall(request).execute().use { response ->
                    val text = response.body.string()
                    if (response.isSuccessful) {
                        ApiResult.Ok(apiJson.decodeFromString(Envelope.serializer(answer), text).data)
                    } else {
                        refusalOf(response.code, text, response.header("Retry-After"))
                    }
                }
            } catch (_: IOException) {
                ApiResult.NoConnection
            } catch (_: SerializationException) {
                ApiResult.Refused(0, null, "", null, null)
            }
        }

    private fun refusalOf(status: Int, text: String, retryAfter: String?): ApiResult.Refused {
        val body = try {
            apiJson.decodeFromString(RefusalBody.serializer(), text)
        } catch (_: SerializationException) {
            null
        }
        return ApiResult.Refused(
            status = status,
            code = body?.errors?.code?.takeIf { it.isNotEmpty() },
            message = body?.message.orEmpty(),
            details = body?.errors?.details,
            retryAfterSeconds = retryAfter?.toLongOrNull(),
        )
    }
}

/** The upload's body, whose size in bytes counts against LSN-13's limit. */
fun uploadBodyOf(messages: List<UploadMessage>): String =
    apiJson.encodeToString(UploadRequest.serializer(), UploadRequest(messages))
