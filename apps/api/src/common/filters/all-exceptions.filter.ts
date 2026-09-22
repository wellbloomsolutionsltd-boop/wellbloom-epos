import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from "@nestjs/common";
import {
  HttpAdapterHost,
} from "@nestjs/core";
import type {
  RequestWithId,
} from "../middleware/request-id.middleware";

@Catch()
export class AllExceptionsFilter
  implements ExceptionFilter
{
  private readonly logger =
    new Logger(
      AllExceptionsFilter.name,
    );

  constructor(
    @Inject(HttpAdapterHost)
    private readonly adapterHost:
      HttpAdapterHost,
  ) {}

  catch(
    exception: unknown,
    host: ArgumentsHost,
  ) {
    const {
      httpAdapter,
    } = this.adapterHost;

    const ctx =
      host.switchToHttp();

    const request =
      ctx.getRequest<
        RequestWithId
      >();

    const status =
      exception instanceof
      HttpException
        ? exception.getStatus()
        : HttpStatus
            .INTERNAL_SERVER_ERROR;

    let message:
      | string
      | string[] =
      "Internal server error";

    if (
      status < 500 &&
      exception instanceof
        HttpException
    ) {
      const response =
        exception.getResponse();

      if (
        typeof response ===
        "string"
      ) {
        message = response;
      } else if (
        response &&
        typeof response ===
          "object" &&
        "message" in response
      ) {
        const responseMessage =
          response.message;

        if (
          typeof responseMessage ===
            "string" ||
          (
            Array.isArray(
              responseMessage,
            ) &&
            responseMessage.every(
              (item) =>
                typeof item ===
                "string",
            )
          )
        ) {
          message = responseMessage;
        }
      }
    }

    if (status >= 500) {
      this.logger.error(
        `Request ${request.requestId ?? "unknown"} failed`,
        exception instanceof Error
          ? exception.stack
          : String(exception),
      );
    }

    httpAdapter.reply(
      ctx.getResponse(),
      {
        statusCode:
          status,

        message,

        requestId:
          request.requestId,

        timestamp:
          new Date()
            .toISOString(),

        path:
          httpAdapter
            .getRequestUrl(
              request,
            ),
      },
      status,
    );
  }
}
