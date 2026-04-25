from __future__ import annotations

import logging
import os
import urllib.error
import urllib.request
from urllib.parse import urlparse

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes


logging.basicConfig(
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    level=logging.INFO, 
)
logger = logging.getLogger("web_yolo_telegram_bot")


BOT_TOKEN = "8363556082:AAHk6UuUxfozn7LsKfws8o7KLStwBXYPfAI"
WEBAPP_URL = "http://37.140.243.39:3000"
FRONTEND_HEALTH_URL = WEBAPP_URL + "/health"
BACKEND_HEALTH_URL = "http://37.140.243.39:8000/health"


def is_valid_external_url(url: str) -> bool:
    parsed = urlparse(url)
    return bool(parsed.scheme in {"http", "https"} and parsed.netloc)


def is_supported_webapp_url(url: str) -> bool:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    return is_valid_external_url(url) and (parsed.scheme == "https" or host in {"localhost", "127.0.0.1"})


def build_open_keyboard() -> InlineKeyboardMarkup | None:
    buttons = []

    if is_supported_webapp_url(WEBAPP_URL):
        buttons.append(
            [InlineKeyboardButton(text="Open Web Interface", web_app=WebAppInfo(url=WEBAPP_URL))]
        )

    if is_valid_external_url(WEBAPP_URL):
        buttons.append([InlineKeyboardButton(text="Open In Browser", url=WEBAPP_URL)])

    return InlineKeyboardMarkup(buttons) if buttons else None


def check_url(url: str) -> tuple[bool, str]:
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            return True, f"{response.status}"
    except urllib.error.HTTPError as exc:
        return False, f"HTTP {exc.code}"
    except urllib.error.URLError as exc:
        return False, str(exc.reason)
    except Exception as exc:  # pragma: no cover
        return False, str(exc)


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = (
        "YOLO web interface is ready.\n\n"
        "Use the button below to open the site and run inference from Telegram."
    )
    await update.message.reply_text(text=text, reply_markup=build_open_keyboard())


async def open_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        text=f"Web interface: {WEBAPP_URL}",
        reply_markup=build_open_keyboard(),
    )


async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    frontend_ok, frontend_message = check_url(FRONTEND_HEALTH_URL)
    backend_ok, backend_message = check_url(BACKEND_HEALTH_URL)

    frontend_status = "OK" if frontend_ok else "FAIL"
    backend_status = "OK" if backend_ok else "FAIL"

    text = (
        "Service status:\n"
        f"- frontend: {frontend_status} ({frontend_message})\n"
        f"- backend: {backend_status} ({backend_message})\n\n"
        f"Web URL: {WEBAPP_URL}"
    )
    await update.message.reply_text(text=text, reply_markup=build_open_keyboard())


async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.exception("Telegram bot update failed", exc_info=context.error)


def main() -> None:
    if not BOT_TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is required")

    application = Application.builder().token(BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("open", open_command))
    application.add_handler(CommandHandler("status", status_command))
    application.add_error_handler(error_handler)

    logger.info("Starting Telegram bot")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
