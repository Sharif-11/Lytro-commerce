import { Catch, Inject, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ApiError } from '../../../common/api-error';
import { languageOf, pageHeaders } from '../page/ask';
import { drawProblem, type PageProblem } from '../page/render';
import { PaymentPageAssets } from '../services/payment-page-assets';
import { PAY_PAGE_MEDIA_ORIGIN } from '../tokens';

interface PageRequest {
  query?: Readonly<Record<string, unknown>>;
  body?: Readonly<Record<string, unknown>> | undefined;
}

interface PageResponse {
  status(code: number): PageResponse;
  set(headers: Record<string, string>): PageResponse;
  send(body: string): unknown;
}

/** TVR-03, PAY-03, RTE-06: a shopper on the page is answered with a page, never the API's JSON. */
@Catch()
export class PaymentPageErrors implements ExceptionFilter {
  private readonly logger = new Logger('PaymentPageErrors');

  constructor(
    @Inject(PaymentPageAssets) private readonly assets: PaymentPageAssets,
    @Inject(PAY_PAGE_MEDIA_ORIGIN) private readonly mediaOrigin: string | undefined,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<PageRequest>();
    const [status, problem] = this.answerTo(exception);
    if (problem === 'wrong') this.logger.error(exception);
    const language = languageOf(request.query?.['lang'] ?? request.body?.['lang']);
    http
      .getResponse<PageResponse>()
      .status(status)
      .set(pageHeaders(this.mediaOrigin))
      .send(drawProblem(problem, language, this.assets.urls));
  }

  private answerTo(exception: unknown): readonly [number, PageProblem] {
    if (exception instanceof ApiError) {
      if (exception.code === 'not_found') return [404, 'missing'];
      if (exception.code === 'tenant_offline') return [403, 'suspended'];
      if (exception.code === 'rate_limited') return [429, 'busy'];
    }
    return [500, 'wrong'];
  }
}
