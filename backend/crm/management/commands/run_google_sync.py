import json
import requests
import urllib.parse
from django.core.management.base import BaseCommand
from django.utils import timezone
from crm.models import Campaign, PipelineStage
from crm.views_google import get_refreshed_access_token
from core.models import Student
from django.contrib.auth import get_user_model
from django.db import transaction as django_db_transaction

User = get_user_model()

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
            access_token = get_refreshed_access_token(campaign)
            if not access_token:
                self.stdout.write(self.style.ERROR(f'Failed to get access token for Campaign {campaign.id}'))
                continue
                
            quoted_sheet_name = f"'{campaign.google_sheet_name or 'Sheet1'}'"
            encoded_range = urllib.parse.quote_plus(quoted_sheet_name)
            sheets_url = f"https://sheets.googleapis.com/v4/spreadsheets/{campaign.google_spreadsheet_id}/values/{encoded_range}!A:Z"
            headers = {'Authorization': f'Bearer {access_token}'}
            
            try:
                res = requests.get(sheets_url, headers=headers)
                if res.status_code != 200:
                    self.stdout.write(self.style.ERROR(f'Google sheets API returned status code {res.status_code}: {res.text[:200]}'))
                    continue
                    
                sheet_data = res.json()
                rows = sheet_data.get('values', [])
                if not rows:
                    self.stdout.write(f'Sheet for Campaign {campaign.id} is empty.')
                    continue
                    
                headers_row = [str(h).lower().strip() for h in rows[0]]
                
                def get_index(names):
                    for name in names:
                        if name in headers_row:
                            return headers_row.index(name)
                    return -1
                    
                first_name_idx = get_index(['first name', 'firstname', 'name', 'student name', 'student_name', 'full_name', 'fullname'])
                last_name_idx = get_index(['last name', 'lastname', 'surname'])
                mobile_idx = get_index(['mobile', 'phone', 'contact', 'mobile number', 'phone number', 'phone_number'])
                email_idx = get_index(['email', 'email address', 'mail'])
                
                if mobile_idx == -1 and first_name_idx == -1:
                    self.stdout.write(self.style.ERROR(f'Could not identify Name or Mobile columns in campaign {campaign.id} headers.'))
                    continue
                    
                new_stage = PipelineStage.objects.filter(name__iexact='New Lead').first() or PipelineStage.objects.filter(is_default=True).first()
                new_stage_id = str(new_stage.id) if new_stage else 'NEW'
                
                start_row_index = max(1, campaign.google_last_synced_row)
                imported_count = 0
                
                for idx, row in enumerate(rows[start_row_index:], start=start_row_index):
                    if not row:
                        continue
                        
                    def get_cell(col_idx):
                        if col_idx != -1 and col_idx < len(row):
                            return str(row[col_idx]).strip()
                        return ''
                        
                    full_name = get_cell(first_name_idx)
                    last_name = get_cell(last_name_idx) if last_name_idx != -1 else ''
                    mobile = get_cell(mobile_idx)
                    email = get_cell(email_idx)
                    
                    if not mobile and not full_name:
                        continue
                        
                    if full_name and not last_name:
                        parts = full_name.split(' ', 1)
                        first_name = parts[0]
                        last_name = parts[1] if len(parts) > 1 else ''
                    else:
                        first_name = full_name
                        
                    if not first_name:
                        first_name = "Sheet Lead"
                        
                    cleaned_phone = ''.join(c for c in mobile if c.isdigit())
                    if len(cleaned_phone) > 10:
                        cleaned_phone = cleaned_phone[-10:]
                        
                    if not cleaned_phone:
                        continue
                        
                    exists = Student.objects.filter(mobile=cleaned_phone).exists()
                    if exists:
                        continue
                        
                    temp_username = f"st_{cleaned_phone}"
                    count = Student.objects.filter(crm_student_id__startswith="NATYA-").count() + 1
                    crm_id = f"NATYA-{1000 + count}"
                    
                    try:
                        with django_db_transaction.atomic():
                            user, created = User.objects.get_or_create(
                                username=temp_username,
                                defaults={
                                    'first_name': first_name,
                                    'last_name': last_name,
                                    'email': email or f"{temp_username}@gmail.com",
                                    'role': 'STUDENT'
                                }
                            )
                            
                            from core.models import Program
                            program = Program.objects.exclude(name="Wise Import").first() or Program.objects.first()
                            
                            student = Student.objects.create(
                                user=user,
                                crm_student_id=crm_id,
                                program_type=program,
                                first_name=first_name,
                                last_name=last_name,
                                email=email,
                                mobile=cleaned_phone,
                                campaign=campaign,
                                lead_status=new_stage_id,
                                sales_section=campaign.section
                            )
                            
                            assignees = list(campaign.auto_assign_to.all())
                            if assignees:
                                rep = assignees[imported_count % len(assignees)]
                                student.assigned_to = rep
                                student.save()
                                
                        imported_count += 1
                    except Exception as row_ex:
                        self.stdout.write(self.style.ERROR(f'Row {idx} sync error: {str(row_ex)}'))
                        
                campaign.google_last_synced_row = len(rows)
                campaign.save()
                self.stdout.write(self.style.SUCCESS(f'Imported {imported_count} new leads for Campaign {campaign.name}.'))
                
            except Exception as ex:
                self.stdout.write(self.style.ERROR(f'Campaign {campaign.id} general sync error: {str(ex)}'))
