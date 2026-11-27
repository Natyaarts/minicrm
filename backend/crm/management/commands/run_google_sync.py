import logging
import requests
from django.core.management.base import BaseCommand
from crm.models import Campaign
from crm.views_google import (
    get_refreshed_access_token,
    fetch_google_sheet_values,
    sync_campaign_sheet_rows,
)

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Runs the Google Sheets auto-sync for active campaigns'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting Google Sheets Auto-Sync Scheduler...'))

        # Get active campaigns with spreadsheet settings and auto-sync enabled
        campaigns = Campaign.objects.filter(
            status='ACTIVE',
            google_auto_sync=True
        ).exclude(google_spreadsheet_id__isnull=True).exclude(google_spreadsheet_id='')

        if not campaigns.exists():
            self.stdout.write('No campaigns configured for auto-sync.')
            return

        for campaign in campaigns:
            self.stdout.write(f'Syncing campaign: {campaign.name} (ID: {campaign.id})...')
            try:
                fetch_res = fetch_google_sheet_values(
                    campaign,
                    get_token_fn=get_refreshed_access_token,
                    requests_get_fn=requests.get,
                )
                if not fetch_res.get('ok'):
                    if fetch_res.get('auth_error'):
                        self.stdout.write(self.style.ERROR(f'Failed to get access token for Campaign {campaign.id}'))
                    else:
                        status_code = fetch_res.get('status_code', 'ERROR')
                        details = str(fetch_res.get('details', ''))[:200]
                        self.stdout.write(
                            self.style.ERROR(f'Google sheets API returned status code {status_code}: {details}')
                        )
                    continue

                rows = fetch_res.get('rows', [])
                if not rows:
                    self.stdout.write(f'Sheet for Campaign {campaign.id} is empty.')
                    continue

                sync_res = sync_campaign_sheet_rows(campaign=campaign, rows=rows)
                if not sync_res.get('ok'):
                    self.stdout.write(
                        self.style.ERROR(f"Could not identify Name or Mobile columns in campaign {campaign.id} headers.")
                    )
                    continue

                for err in sync_res.get('row_errors', []):
                    self.stdout.write(self.style.ERROR(f"Row {err['row']} sync error: {err['error']}"))

                self.stdout.write(
                    self.style.SUCCESS(
                        f"Imported {sync_res['imported']} new leads for Campaign {campaign.name} "
                        f"(Added: {sync_res['added']}, Duplicates: {sync_res['duplicates']}, "
                        f"Skipped: {sync_res['skipped']}, Failed: {sync_res['failed']})."
                    )
                )
            except Exception as ex:
                logger.error("Campaign %s general sync error: %s", campaign.id, ex, exc_info=True)
                self.stdout.write(self.style.ERROR(f'Campaign {campaign.id} general sync error: {str(ex)}'))
