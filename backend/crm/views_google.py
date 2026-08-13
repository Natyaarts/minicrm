import json
import requests
from django.utils import timezone
from datetime import timedelta
from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.conf import settings
from django.shortcuts import redirect
from django.contrib.auth import get_user_model
from django.utils.dateparse import parse_datetime
from .models import Campaign, PipelineStage
from core.models import Student

User = get_user_model()

class GoogleAuthUrlView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        campaign_id = request.query_params.get('campaign_id')
        if not campaign_id:
            return Response({'error': 'campaign_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Scopes: spreadsheets read-only and drive.readonly to list spreadsheets
        scopes = [
            'https://www.googleapis.com/auth/spreadsheets.readonly',
            'https://www.googleapis.com/auth/drive.readonly'
        ]
        
        state_data = {
            'campaign_id': campaign_id,
            'user_id': request.user.id
        }
        state_str = json.dumps(state_data)
        
        auth_url = (
            "https://accounts.google.com/o/oauth2/v2/auth"
            f"?client_id={settings.GOOGLE_CLIENT_ID}"
            f"&redirect_uri={settings.GOOGLE_REDIRECT_URI}"
            f"&response_type=code"
            f"&scope={' '.join(scopes)}"
            f"&access_type=offline"
            f"&prompt=consent"
            f"&state={requests.utils.quote(state_str)}"
        )
        return Response({'url': auth_url})

class GoogleCallbackView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        code = request.query_params.get('code')
        state_str = request.query_params.get('state')
        
        if not code or not state_str:
            return Response({'error': 'Missing code or state parameters'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            state_data = json.loads(state_str)
            campaign_id = state_data.get('campaign_id')
        except Exception:
            return Response({'error': 'Invalid state parameter'}, status=status.HTTP_400_BAD_REQUEST)
            
        # Exchange authorization code for token
        token_url = "https://oauth2.googleapis.com/token"
        payload = {
            'code': code,
            'client_id': settings.GOOGLE_CLIENT_ID,
            'client_secret': settings.GOOGLE_CLIENT_SECRET,
            'redirect_uri': settings.GOOGLE_REDIRECT_URI,
            'grant_type': 'authorization_code'
        }
        
        res = requests.post(token_url, data=payload)
        if res.status_code != 200:
            return Response({'error': 'Failed to exchange authorization code', 'details': res.json()}, status=status.HTTP_400_BAD_REQUEST)
            
        token_data = res.json()
        access_token = token_data.get('access_token')
        refresh_token = token_data.get('refresh_token')
        expires_in = token_data.get('expires_in', 3600)
        
        try:
            campaign = Campaign.objects.get(id=campaign_id)
            campaign.google_access_token = access_token
            if refresh_token:
                campaign.google_refresh_token = refresh_token
            campaign.google_token_expiry = timezone.now() + timedelta(seconds=expires_in)
            campaign.save()
        except Campaign.DoesNotExist:
            return Response({'error': 'Campaign not found'}, status=status.HTTP_404_NOT_FOUND)
            
        # Redirect back to campaigns admin panel in the frontend React app
        frontend_url = "https://natyaarts.org/crm/campaigns"
        return redirect(frontend_url)

def get_refreshed_access_token(campaign):
    if not campaign.google_refresh_token:
        return None
    
    # Check if token is expired
    if campaign.google_token_expiry and campaign.google_token_expiry > timezone.now() + timedelta(minutes=1):
        return campaign.google_access_token
        
    token_url = "https://oauth2.googleapis.com/token"
    payload = {
        'client_id': settings.GOOGLE_CLIENT_ID,
        'client_secret': settings.GOOGLE_CLIENT_SECRET,
        'refresh_token': campaign.google_refresh_token,
        'grant_type': 'refresh_token'
    }
    
    res = requests.post(token_url, data=payload)
    if res.status_code == 200:
        token_data = res.json()
        campaign.google_access_token = token_data.get('access_token')
        expires_in = token_data.get('expires_in', 3600)
        campaign.google_token_expiry = timezone.now() + timedelta(seconds=expires_in)
        campaign.save()
        return campaign.google_access_token
    return None

class GoogleSpreadsheetsListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        campaign_id = request.query_params.get('campaign_id')
        try:
            campaign = Campaign.objects.get(id=campaign_id)
        except Campaign.DoesNotExist:
            return Response({'error': 'Campaign not found'}, status=status.HTTP_404_NOT_FOUND)
            
        access_token = get_refreshed_access_token(campaign)
        if not access_token:
            return Response({'error': 'Google authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
            
        # Call Google Drive API to list spreadsheets
        drive_url = "https://www.googleapis.com/drive/v3/files"
        headers = {'Authorization': f'Bearer {access_token}'}
        params = {
            'q': "mimeType='application/vnd.google-apps.spreadsheet'",
            'pageSize': 50,
            'fields': 'files(id, name)'
        }
        
        res = requests.get(drive_url, headers=headers, params=params)
        if res.status_code != 200:
            return Response({'error': 'Failed to fetch spreadsheets from Google', 'details': res.json()}, status=status.HTTP_400_BAD_REQUEST)
            
        return Response(res.json())

class GoogleSheetSyncView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        campaign_id = request.data.get('campaign_id')
        spreadsheet_id = request.data.get('spreadsheet_id')
        sheet_name = request.data.get('sheet_name', 'Sheet1')
        
        try:
            campaign = Campaign.objects.get(id=campaign_id)
        except Campaign.DoesNotExist:
            return Response({'error': 'Campaign not found'}, status=status.HTTP_404_NOT_FOUND)
            
        if spreadsheet_id:
            campaign.google_spreadsheet_id = spreadsheet_id
            campaign.google_sheet_name = sheet_name
            campaign.save()
            
        if not campaign.google_spreadsheet_id:
            return Response({'error': 'Spreadsheet ID not configured'}, status=status.HTTP_400_BAD_REQUEST)
            
        access_token = get_refreshed_access_token(campaign)
        if not access_token:
            return Response({'error': 'Google authentication token is missing or expired'}, status=status.HTTP_401_UNAUTHORIZED)
            
        # Get values from Sheet
        sheet_range = f"{campaign.google_sheet_name or 'Sheet1'}!A:Z"
        sheets_url = f"https://sheets.googleapis.com/v4/spreadsheets/{campaign.google_spreadsheet_id}/values/{requests.utils.quote(sheet_range)}"
        headers = {'Authorization': f'Bearer {access_token}'}
        
        res = requests.get(sheets_url, headers=headers)
        if res.status_code != 200:
            return Response({'error': 'Failed to fetch sheet content', 'details': res.json()}, status=status.HTTP_400_BAD_REQUEST)
            
        sheet_data = res.json()
        rows = sheet_data.get('values', [])
        
        if not rows:
            return Response({'message': 'Sheet is empty', 'imported': 0})
            
        # Assume first row is header
        headers_row = [str(h).lower().strip() for h in rows[0]]
        
        # Helper to find column indices
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
            return Response({'error': 'Could not identify Name or Mobile columns in header row'}, status=status.HTTP_400_BAD_REQUEST)
            
        imported_count = 0
        skipped_count = 0
        
        # Get default stage ID
        new_stage = PipelineStage.objects.filter(name__iexact='New Lead').first() or PipelineStage.objects.filter(is_default=True).first()
        new_stage_id = str(new_stage.id) if new_stage else 'NEW'
        
        # Import data starting from configured last row
        start_row_index = max(1, campaign.google_last_synced_row)
        
        for idx, row in enumerate(rows[start_row_index:], start=start_row_index):
            if not row:
                continue
                
            # Extract cell values safely
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
                
            # If name is a single full name and last_name_idx is not found, split it
            if full_name and not last_name:
                parts = full_name.split(' ', 1)
                first_name = parts[0]
                last_name = parts[1] if len(parts) > 1 else ''
            else:
                first_name = full_name
                
            if not first_name:
                first_name = "Sheet Lead"
                
            # Sanitize phone
            cleaned_phone = ''.join(c for c in mobile if c.isdigit())
            if len(cleaned_phone) > 10:
                cleaned_phone = cleaned_phone[-10:]
                
            if not cleaned_phone:
                skipped_count += 1
                continue
                
            # Create user account and student profile (checking duplicates)
            exists = Student.objects.filter(mobile=cleaned_phone).exists()
            if exists:
                skipped_count += 1
                continue
                
            # Generate temporary username
            from django.contrib.auth import get_user_model
            temp_username = f"st_{cleaned_phone}"
            
            try:
                with django_transaction():
                    user, created = User.objects.get_or_create(
                        username=temp_username,
                        defaults={
                            'first_name': first_name,
                            'last_name': last_name,
                            'email': email or f"{temp_username}@gmail.com",
                            'role': 'STUDENT'
                        }
                    )
                    
                    student = Student.objects.create(
                        user=user,
                        first_name=first_name,
                        last_name=last_name,
                        email=email,
                        mobile=cleaned_phone,
                        campaign=campaign,
                        lead_status=new_stage_id,
                        sales_section=campaign.section
                    )
                    
                    # Handle Auto Assignment
                    assignees = list(campaign.auto_assign_to.all())
                    if assignees:
                        # Simple Round-Robin: select assignee based on lead index
                        rep = assignees[imported_count % len(assignees)]
                        student.assigned_to = rep
                        student.save()
                        
                imported_count += 1
            except Exception as ex:
                skipped_count += 1
                continue
                
        # Save progress
        campaign.google_last_synced_row = len(rows)
        campaign.save()
        
        return Response({
            'message': 'Sync complete',
            'imported': imported_count,
            'skipped': skipped_count,
            'last_row': campaign.google_last_synced_row
        })

from django.db import transaction as django_db_transaction
def django_transaction():
    return django_db_transaction.atomic()
