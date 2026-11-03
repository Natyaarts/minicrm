import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from crm.models import MetaConversionEvent
from crm.services.meta_capi import send_meta_event

logger = logging.getLogger(__name__)

PROCESSING_TIMEOUT_MINUTES = 15


class Command(BaseCommand):
    help = "Send pending Meta Conversions API events and retry failed events."

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit",
            type=int,
            default=100,
            help="Maximum number of events to process.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List eligible events without sending them.",
        )

    def handle(self, *args, **options):
        limit = max(1, options["limit"])
        dry_run = options["dry_run"]

        now = timezone.now()
        stale_before = now - timedelta(
            minutes=PROCESSING_TIMEOUT_MINUTES
        )

        stale_events = MetaConversionEvent.objects.filter(
            status="PROCESSING",
            processing_started_at__lt=stale_before,
        )

        if dry_run:
            stale_count = stale_events.count()

            if stale_count:
                self.stdout.write(
                    f"Would recover {stale_count} stale PROCESSING event(s)."
                )

        else:
            recovered_count = stale_events.update(
                status="FAILED",
                next_retry_at=now,
                processing_started_at=None,
                last_error=(
                    "Recovered automatically: event was stuck in "
                    "PROCESSING for more than 15 minutes."
                ),
            )

            if recovered_count:
                self.stdout.write(
                    self.style.WARNING(
                        f"Recovered {recovered_count} stale event(s)."
                    )
                )

        now = timezone.now()

        eligible = MetaConversionEvent.objects.filter(
            Q(status="PENDING") | Q(status="FAILED"),
            attempts__lt=F("max_attempts"),
            next_retry_at__lte=now,
        ).order_by("created_at")

        event_ids = list(
            eligible.values_list("pk", flat=True)[:limit]
        )

        if not event_ids:
            self.stdout.write(
                self.style.SUCCESS("No Meta events are due.")
            )
            return

        if dry_run:
            self.stdout.write(
                f"Dry run: {len(event_ids)} event(s) ready to send."
            )

            for event in MetaConversionEvent.objects.filter(
                pk__in=event_ids
            ).order_by("created_at"):
                self.stdout.write(
                    f"{event.pk} | {event.event_name} | {event.status}"
                )

            return

        sent_count = 0
        failed_count = 0
        skipped_count = 0

        for event_id in event_ids:
            # Atomically claim the event to prevent concurrent sending.
            claim_time = timezone.now()

            with transaction.atomic():
                claimed = MetaConversionEvent.objects.filter(
                    pk=event_id,
                    status__in=["PENDING", "FAILED"],
                    next_retry_at__lte=claim_time,
                    attempts__lt=F("max_attempts"),
                ).update(
                    status="PROCESSING",
                    attempts=F("attempts") + 1,
                    processing_started_at=claim_time,
                )

            if not claimed:
                skipped_count += 1
                continue

            event = MetaConversionEvent.objects.get(pk=event_id)

            try:
                response_status, response_data = send_meta_event(event)

                event.status = "SENT"
                event.sent_at = timezone.now()
                event.processing_started_at = None
                event.last_http_status = response_status
                event.last_error = ""
                event.meta_response = response_data

                event.save(
                    update_fields=[
                        "status",
                        "sent_at",
                        "processing_started_at",
                        "last_http_status",
                        "last_error",
                        "meta_response",
                    ]
                )

                sent_count += 1

                self.stdout.write(
                    self.style.SUCCESS(
                        f"Sent: {event.event_name} ({event.pk})"
                    )
                )

            except Exception as exc:
                # Exponential retry: 1, 2, 4, 8... minutes,
                # capped at 6 hours.
                delay_minutes = min(
                    60 * (2 ** max(event.attempts - 1, 0)),
                    360,
                )

                event.status = "FAILED"
                event.processing_started_at = None
                event.next_retry_at = (
                    timezone.now() + timedelta(minutes=delay_minutes)
                )
                event.last_error = str(exc)[:4000]

                response = getattr(exc, "response", None)

                if response is not None:
                    event.last_http_status = response.status_code

                    try:
                        event.meta_response = response.json()
                    except ValueError:
                        event.meta_response = {
                            "error": "Meta returned a non-JSON response."
                        }

                event.save(
                    update_fields=[
                        "status",
                        "processing_started_at",
                        "next_retry_at",
                        "last_error",
                        "last_http_status",
                        "meta_response",
                    ]
                )

                failed_count += 1

                logger.exception(
                    "Meta event %s failed (attempt %s).",
                    event.pk,
                    event.attempts,
                )

                self.stderr.write(
                    self.style.ERROR(
                        f"Failed: {event.event_name} ({event.pk}) - {exc}"
                    )
                )

        self.stdout.write(
            f"Finished. Sent: {sent_count}, "
            f"Failed: {failed_count}, "
            f"Skipped: {skipped_count}"
        )