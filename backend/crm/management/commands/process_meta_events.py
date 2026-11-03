
import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from crm.models import MetaConversionEvent
from crm.services.meta_capi import send_meta_event

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Process pending Meta Conversions API events"

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit",
            type=int,
            default=100,
            help="Maximum number of events to process",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List eligible events without sending",
        )

    def handle(self, *args, **options):
        limit = max(1, options["limit"])
        now = timezone.now()

        eligible = MetaConversionEvent.objects.filter(
            Q(status="PENDING") | Q(status="FAILED"),
            next_retry_at__lte=now,
            attempts__lt=F("max_attempts"),
        ).order_by("created_at")

        event_ids = list(
            eligible.values_list("pk", flat=True)[:limit]
        )

        self.stdout.write(
            f"Found {len(event_ids)} eligible Meta events."
        )

        if options["dry_run"]:
            for event in MetaConversionEvent.objects.filter(
                pk__in=event_ids
            ):
                self.stdout.write(
                    f"{event.pk} | {event.event_name} | {event.status}"
                )
            return

        sent = 0
        failed = 0
        skipped = 0

        for event_id in event_ids:
            with transaction.atomic():
                event = (
                    MetaConversionEvent.objects
                    .select_for_update()
                    .filter(
                        pk=event_id,
                        status__in=["PENDING", "FAILED"],
                        next_retry_at__lte=timezone.now(),
                        attempts__lt=F("max_attempts"),
                    )
                    .first()
                )

                if not event:
                    skipped += 1
                    continue

                event.status = "PROCESSING"
                event.attempts += 1
                event.save(update_fields=["status", "attempts"])

            try:
                http_status, response_data = send_meta_event(event)

                event.status = "SENT"
                event.last_http_status = http_status
                event.meta_response = response_data
                event.last_error = ""
                event.sent_at = timezone.now()

                event.save(update_fields=[
                    "status",
                    "last_http_status",
                    "meta_response",
                    "last_error",
                    "sent_at",
                ])

                sent += 1
                self.stdout.write(
                    self.style.SUCCESS(f"Sent: {event.pk}")
                )

            except Exception as exc:
                event.last_error = str(exc)[:4000]

                if event.attempts >= event.max_attempts:
                    event.status = "FAILED"
                else:
                    event.status = "PENDING"
                    delay_minutes = min(
                        2 ** event.attempts, 360
                    )
                    event.next_retry_at = (
                        timezone.now()
                        + timedelta(minutes=delay_minutes)
                    )

                response = getattr(exc, "response", None)
                if response is not None:
                    event.last_http_status = response.status_code
                    try:
                        event.meta_response = response.json()
                    except ValueError:
                        event.meta_response = {
                            "error": "Non-JSON response from Meta"
                        }

                event.save(update_fields=[
                    "status",
                    "last_error",
                    "next_retry_at",
                    "last_http_status",
                    "meta_response",
                ])

                failed += 1
                logger.exception("Meta event %s failed", event.pk)

                self.stderr.write(
                    self.style.ERROR(f"Failed: {event.pk} - {exc}")
                )

        self.stdout.write(
            f"Finished. Sent: {sent}, Failed: {failed}, "
            f"Skipped: {skipped}"
        )
