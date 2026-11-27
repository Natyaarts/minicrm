import hashlib
import json
import logging
import re
import time
import urllib.parse
import uuid
import requests
from django.utils import timezone
from datetime import timedelta
from django.db import transaction as django_db_transaction
from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.conf import settings
from django.shortcuts import redirect
from django.contrib.auth import get_user_model
from django.utils.dateparse import parse_datetime
from .models import Campaign, PipelineStage
from core.models import Student, Program, normalize_phone_number
from .services import get_next_assigned_rep
from .services.sheet_columns import (
    find_preferred_contact_time_index,
    get_preferred_contact_time,
    resolve_sheet_column_indices,
)
from .services.deduplication import (
    acquire_lead_creation_lock,
    lookup_existing_student,
    normalize_lead_phone,
    normalize_lead_email,
    create_duplicate_lead,
)

logger = logging.getLogger(__name__)
User = get_user_model()


def django_transaction():
    return django_db_transaction.atomic()


def extract_spreadsheet_id(raw_value: str) -> str:
    """
    Extract a clean Google Spreadsheet ID whether configured as a raw ID or full Google Sheets URL.
    """
    val = str(raw_value or '').strip()
    if not val:
        return ''
    match = re.search(r'/spreadsheets/d/([a-zA-Z0-9-_]+)', val)
    if match:
        return match.group(1)
    return val


def build_google_sheets_values_url(spreadsheet_id: str, sheet_name: str = 'Sheet1', include_sheet_tab: bool = True) -> str:
    clean_id = extract_spreadsheet_id(spreadsheet_id)
    if not include_sheet_tab:
        return f"https://sheets.googleapis.com/v4/spreadsheets/{clean_id}/values/A:Z"
    tab = (sheet_name or 'Sheet1').strip() or 'Sheet1'
    escaped_tab = tab.replace("'", "''")
    quoted_sheet_name = f"'{escaped_tab}'"
    encoded_range = urllib.parse.quote(quoted_sheet_name, safe='')
    return f"https://sheets.googleapis.com/v4/spreadsheets/{clean_id}/values/{encoded_range}!A:Z"

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

def get_refreshed_access_token(campaign, force_refresh: bool = False):
    if not force_refresh and campaign.google_access_token:
        if campaign.google_token_expiry and campaign.google_token_expiry > timezone.now() + timedelta(minutes=1):
            return campaign.google_access_token
        if not campaign.google_token_expiry and not campaign.google_refresh_token:
            return campaign.google_access_token

    if not campaign.google_refresh_token:
        logger.warning("Google OAuth refresh token missing for Campaign %s (%s).", campaign.id, campaign.name)
        return None
        
    token_url = "https://oauth2.googleapis.com/token"
    payload = {
        'client_id': settings.GOOGLE_CLIENT_ID,
        'client_secret': settings.GOOGLE_CLIENT_SECRET,
        'refresh_token': campaign.google_refresh_token,
        'grant_type': 'refresh_token'
    }
    
    try:
        res = requests.post(token_url, data=payload, timeout=15)
    except Exception as exc:
        logger.error("Network error refreshing Google OAuth token for Campaign %s: %s", campaign.id, exc)
        return None

    if res.status_code == 200:
        try:
            token_data = res.json()
        except Exception:
            logger.error("Invalid JSON from Google token endpoint for Campaign %s.", campaign.id)
            return None
        access_token = token_data.get('access_token')
        if not access_token:
            logger.error("Google token response missing access_token for Campaign %s.", campaign.id)
            return None
        campaign.google_access_token = access_token
        update_fields = ['google_access_token', 'google_token_expiry']
        if token_data.get('refresh_token'):
            campaign.google_refresh_token = token_data['refresh_token']
            update_fields.append('google_refresh_token')
        expires_in = token_data.get('expires_in', 3600)
        campaign.google_token_expiry = timezone.now() + timedelta(seconds=int(expires_in))
        campaign.save(update_fields=update_fields)
        return campaign.google_access_token

    logger.error(
        "Failed to refresh Google OAuth token for Campaign %s (HTTP %s).",
        campaign.id,
        res.status_code,
    )
    return None


def fetch_google_sheet_values(campaign, get_token_fn=get_refreshed_access_token, requests_get_fn=requests.get, max_retries: int = 3):
    """
    Fetches rows from Google Sheets API v4 with:
    - Safe token retrieval (catches unexpected token errors)
    - Proper URL path encoding (%20 for spaces in tab names)
    - Automatic token force-refresh on HTTP 401
    - Automatic fallback to first sheet tab (A:Z) if default/configured tab returns HTTP 400 range parse error
    - Bounded retry on transient network/5xx/429 failures
    """
    try:
        access_token = get_token_fn(campaign)
    except Exception as exc:
        logger.error("Error obtaining Google access token for Campaign %s: %s", campaign.id, exc)
        return {'ok': False, 'auth_error': True, 'error': 'Google authentication token is missing or expired'}

    if not access_token:
        return {'ok': False, 'auth_error': True, 'error': 'Google authentication token is missing or expired'}

    sheets_url = build_google_sheets_values_url(
        campaign.google_spreadsheet_id,
        campaign.google_sheet_name or 'Sheet1',
        include_sheet_tab=True,
    )
    headers = {'Authorization': f'Bearer {access_token}'}

    last_res = None
    last_exc = None
    for attempt in range(max(1, max_retries)):
        try:
            res = requests_get_fn(sheets_url, headers=headers)
            last_res = res
        except Exception as exc:
            last_exc = exc
            logger.warning(
                "Transient network error fetching Google Sheet for Campaign %s (attempt %s/%s): %s",
                campaign.id, attempt + 1, max_retries, exc
            )
            if attempt + 1 < max_retries:
                time.sleep(0.2 * (attempt + 1))
            continue

        if res.status_code == 200:
            break

        # On 401 Unauthorized, try refreshing the OAuth access token once
        if res.status_code == 401 and attempt == 0:
            campaign.google_token_expiry = timezone.now() - timedelta(seconds=10)
            try:
                refreshed = get_token_fn(campaign)
            except Exception:
                refreshed = None
            if refreshed:
                access_token = refreshed
                headers = {'Authorization': f'Bearer {access_token}'}
                continue

        # On 400 Bad Request (e.g. 'Sheet1' tab does not exist because tab is 'Form Responses 1'),
        # try falling back to the spreadsheet's first sheet tab (values/A:Z) once.
        if res.status_code == 400:
            fallback_url = build_google_sheets_values_url(
                campaign.google_spreadsheet_id,
                include_sheet_tab=False,
            )
            if sheets_url != fallback_url:
                logger.info(
                    "Tab '%s' range failed with HTTP 400 for Campaign %s; falling back to first sheet tab (A:Z).",
                    campaign.google_sheet_name or 'Sheet1',
                    campaign.id,
                )
                sheets_url = fallback_url
                continue

        # Retry on transient rate-limit or 5xx server errors
        if res.status_code in (429, 500, 502, 503, 504) and attempt + 1 < max_retries:
            logger.warning(
                "Google Sheets API returned HTTP %s for Campaign %s (attempt %s/%s); retrying...",
                res.status_code, campaign.id, attempt + 1, max_retries
            )
            time.sleep(0.2 * (attempt + 1))
            continue

        break

    if last_res is None:
        return {
            'ok': False,
            'status_code': 503,
            'error': 'Failed to fetch sheet content due to network error',
            'details': {'error': str(last_exc) if last_exc else 'Network request failed'},
        }

    if last_res.status_code != 200:
        try:
            err_details = last_res.json()
        except Exception:
            err_details = {'raw_content': getattr(last_res, 'text', '')[:500]}
        return {
            'ok': False,
            'status_code': last_res.status_code,
            'error': 'Failed to fetch sheet content',
            'details': err_details,
        }

    try:
        sheet_data = last_res.json()
    except Exception as exc:
        return {
            'ok': False,
            'status_code': 502,
            'error': 'Invalid JSON returned from Google Sheets API',
            'details': {'error': str(exc)},
        }

    return {
        'ok': True,
        'rows': sheet_data.get('values', []) or [],
    }


def sync_campaign_sheet_rows(
    campaign: Campaign,
    rows: list,
    force_full_sync: bool = False,
    previous_last_synced_row: int = None,
) -> dict:
    """
    Core row-processing pipeline for Google Sheets lead import (shared by API view and CLI command):
    Google Sheets rows -> Identify header row & columns -> Validate & normalize fields ->
    Check idempotency / duplicates -> Create CRM lead -> Auto-assign BDE -> Update sync state.
    """
    if not rows:
        return {
            'ok': True,
            'empty': True,
            'message': 'Sheet is empty',
            'imported': 0,
            'added': 0,
            'duplicates': 0,
            'skipped': 0,
            'failed': 0,
            'already_synced': 0,
            'last_row': campaign.google_last_synced_row,
            'row_errors': [],
        }

    col_map = resolve_sheet_column_indices(rows)
    if not col_map:
        return {
            'ok': False,
            'error': 'Could not identify Name or Mobile columns in header row',
        }

    header_row_idx = col_map['header_row_idx']
    first_name_idx = col_map['first_name_idx']
    last_name_idx = col_map['last_name_idx']
    mobile_indices = col_map['mobile_indices']
    email_idx = col_map['email_idx']
    place_idx = col_map['place_idx']
    tag_idx = col_map['tag_idx']
    contact_time_idx = col_map['contact_time_idx']

    from .utils import get_canonical_new_lead_stage_id
    new_stage_id = get_canonical_new_lead_stage_id()

    prev_synced = (
        previous_last_synced_row
        if previous_last_synced_row is not None
        else (campaign.google_last_synced_row or 0)
    )

    data_start_floor = header_row_idx + 1
    if force_full_sync or (campaign.google_last_synced_row or 0) > len(rows) or (campaign.google_last_synced_row or 0) < data_start_floor:
        start_row_index = data_start_floor
    else:
        start_row_index = max(data_start_floor, campaign.google_last_synced_row)

    # Prefetch all deterministic row markers already imported for this campaign in 1 SQL query
    existing_usernames = User.objects.filter(
        student_profile__campaign=campaign,
        username__contains='_gs',
    ).values_list('username', flat=True)
    synced_row_markers = {
        u[u.rfind('_gs'):] for u in existing_usernames if u and '_gs' in u
    }

    spreadsheet_key = extract_spreadsheet_id(campaign.google_spreadsheet_id)

    imported_count = 0
    added_count = 0
    duplicate_count = 0
    skipped_count = 0
    failed_count = 0
    already_synced_count = 0
    row_errors = []

    first_failed_row_idx = None
    first_incomplete_row_idx = None
    last_valid_row_idx = None

    for idx, row in enumerate(rows[start_row_index:], start=start_row_index):
        if not row or not isinstance(row, (list, tuple)):
            continue

        def get_cell(col_idx):
            if col_idx != -1 and col_idx < len(row) and row[col_idx] is not None:
                return str(row[col_idx]).strip()
            return ''

        full_name = get_cell(first_name_idx)
        last_name = get_cell(last_name_idx) if last_name_idx != -1 else ''
        email = get_cell(email_idx)
        place = get_cell(place_idx)
        tag = get_cell(tag_idx)
        preferred_contact_time = get_preferred_contact_time(row, contact_time_idx)

        # Check all candidate phone columns (e.g. primary phone_number, fallback whatsapp_number)
        raw_mobile_values = [get_cell(m_idx) for m_idx in mobile_indices if get_cell(m_idx)]
        mobile = raw_mobile_values[0] if raw_mobile_values else ''
        cleaned_phone = ''
        for raw_m in raw_mobile_values:
            cleaned_phone = normalize_lead_phone(raw_m)
            if cleaned_phone:
                mobile = raw_m
                break

        clean_em = normalize_lead_email(email)

        # Completely blank row (no name, no mobile, no email)
        if not mobile and not full_name and not last_name and not email:
            continue

        if not cleaned_phone and not clean_em:
            skipped_count += 1
            if first_incomplete_row_idx is None:
                first_incomplete_row_idx = idx
            logger.warning(
                "Campaign %s sheet row %s skipped: missing valid mobile and email (name=%r, mobile=%r, email=%r).",
                campaign.id, idx + 1, full_name, mobile, email
            )
            continue

        if full_name and not last_name:
            parts = full_name.split(' ', 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else ''
        else:
            first_name = full_name

        if not first_name:
            first_name = "Sheet Lead"

        first_name = first_name.strip()[:50]
        last_name = last_name.strip()[:50]

        # Deterministic row marker prevents re-importing the same sheet row on retry or force_full_sync
        sheet_row_identity = f"{campaign.id}:{spreadsheet_key}:{idx}:{cleaned_phone}:{clean_em}"
        row_marker = f"_gs{hashlib.md5(sheet_row_identity.encode('utf-8')).hexdigest()[:10]}"

        if row_marker in synced_row_markers:
            already_synced_count += 1
            last_valid_row_idx = idx
            continue

        # Also protect legacy rows (synced before _gs markers) during force_full_sync
        if force_full_sync and prev_synced > data_start_floor and idx < prev_synced:
            legacy_q = Q()
            if cleaned_phone:
                legacy_q |= Q(mobile=cleaned_phone)
            if clean_em:
                legacy_q |= Q(email__iexact=clean_em)
            if legacy_q and Student.objects.filter(campaign=campaign).filter(legacy_q).exists():
                already_synced_count += 1
                last_valid_row_idx = idx
                continue

        extra_student_fields = {'preferred_contact_time': preferred_contact_time}
        if place:
            extra_student_fields['perm_city'] = place[:50]
        if tag:
            extra_student_fields['lms_course_names'] = tag[:500]

        try:
            with django_transaction():
                acquire_lead_creation_lock()

                dup_student, dup_reason = lookup_existing_student(mobile=cleaned_phone, email=clean_em)
                if dup_student:
                    create_duplicate_lead(
                        existing_student=dup_student,
                        first_name=first_name,
                        last_name=last_name,
                        mobile=cleaned_phone or None,
                        email=clean_em or None,
                        campaign=campaign,
                        source_name=f"Google Sheet '{campaign.google_sheet_name or campaign.name}'",
                        duplicate_reason=dup_reason,
                        log_reengagement=False,
                        extra_fields=extra_student_fields,
                        username_suffix=row_marker,
                    )
                    imported_count += 1
                    duplicate_count += 1
                    synced_row_markers.add(row_marker)
                    last_valid_row_idx = idx
                    continue

                base_ident = re.sub(r'[^\w@+\.-]', '_', str(cleaned_phone or clean_em or first_name))[:100]
                temp_username = f"st_{base_ident}{row_marker}"
                if User.objects.filter(username=temp_username).exists():
                    temp_username = f"st_{base_ident}_{uuid.uuid4().hex[:6]}{row_marker}"

                crm_id = Student.generate_next_crm_id()

                user = User.objects.create_user(
                    username=temp_username,
                    first_name=first_name,
                    last_name=last_name,
                    email=clean_em or f"{temp_username}@gmail.com",
                    role='STUDENT',
                )
                user.set_unusable_password()
                user.save(update_fields=['password'])

                program = None
                if campaign and campaign.section == 'CAREER_ACADEMY':
                    program = Program.objects.filter(name='Natya Career Academy').first()
                elif campaign and campaign.section == 'REGULAR':
                    program = Program.objects.filter(name='Natya').first()
                if not program:
                    program = Program.objects.exclude(name="Wise Import").first() or Program.objects.first()

                assigned_to_user = get_next_assigned_rep(campaign)

                Student.objects.create(
                    user=user,
                    crm_student_id=crm_id,
                    program_type=program,
                    first_name=first_name,
                    last_name=last_name,
                    email=clean_em or None,
                    mobile=cleaned_phone or None,
                    campaign=campaign,
                    lead_status=new_stage_id,
                    sales_section=campaign.section,
                    assigned_to=assigned_to_user,
                    **extra_student_fields,
                )

            imported_count += 1
            added_count += 1
            synced_row_markers.add(row_marker)
            last_valid_row_idx = idx
        except Exception as row_ex:
            failed_count += 1
            skipped_count += 1
            if first_failed_row_idx is None:
                first_failed_row_idx = idx
            err_msg = f"Row {idx + 1} sync error: {str(row_ex)}"
            row_errors.append({'row': idx + 1, 'error': str(row_ex)})
            logger.error("Campaign %s %s", campaign.id, err_msg, exc_info=True)

    # Calculate new google_last_synced_row high-water mark:
    # - Never advance past a failed or incomplete row so it can be retried on the next sync.
    # - Never advance past trailing blank rows at the bottom of the sheet.
    hold_back_candidates = [i for i in (first_failed_row_idx, first_incomplete_row_idx) if i is not None]
    if hold_back_candidates:
        new_last_synced_row = min(hold_back_candidates)
    elif last_valid_row_idx is not None:
        new_last_synced_row = last_valid_row_idx + 1
    else:
        new_last_synced_row = start_row_index

    campaign.google_last_synced_row = new_last_synced_row
    campaign.save(update_fields=['google_last_synced_row'])

    return {
        'ok': True,
        'empty': False,
        'message': 'Sync complete',
        'imported': imported_count,
        'added': added_count,
        'duplicates': duplicate_count,
        'skipped': skipped_count,
        'failed': failed_count,
        'already_synced': already_synced_count,
        'last_row': campaign.google_last_synced_row,
        'row_errors': row_errors,
    }

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
            return Response({'authenticated': False, 'files': [], 'message': 'Google authentication required'}, status=status.HTTP_200_OK)
            
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
            
        data = res.json()
        if isinstance(data, dict):
            data['authenticated'] = True
        return Response(data)

class GoogleSheetSyncView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        campaign_id = request.data.get('campaign_id')
        spreadsheet_id = request.data.get('spreadsheet_id')
        sheet_name = request.data.get('sheet_name', 'Sheet1')
        force_full_sync = bool(request.data.get('force_full_sync', False))
        
        try:
            campaign = Campaign.objects.get(id=campaign_id)
        except Campaign.DoesNotExist:
            return Response({'error': 'Campaign not found'}, status=status.HTTP_404_NOT_FOUND)

        previous_last_synced_row = campaign.google_last_synced_row or 0
            
        if spreadsheet_id:
            clean_sheet_id = extract_spreadsheet_id(spreadsheet_id)
            sheet_changed = (
                clean_sheet_id != extract_spreadsheet_id(campaign.google_spreadsheet_id)
                or (sheet_name or 'Sheet1').strip() != (campaign.google_sheet_name or 'Sheet1').strip()
            )
            campaign.google_spreadsheet_id = clean_sheet_id
            campaign.google_sheet_name = (sheet_name or 'Sheet1').strip() or 'Sheet1'
            if force_full_sync or sheet_changed:
                campaign.google_last_synced_row = 1
            campaign.save(update_fields=['google_spreadsheet_id', 'google_sheet_name', 'google_last_synced_row'])
        elif force_full_sync:
            campaign.google_last_synced_row = 1
            campaign.save(update_fields=['google_last_synced_row'])
            
        if not campaign.google_spreadsheet_id:
            return Response({'error': 'Spreadsheet ID not configured'}, status=status.HTTP_400_BAD_REQUEST)

        fetch_res = fetch_google_sheet_values(
            campaign,
            get_token_fn=get_refreshed_access_token,
            requests_get_fn=requests.get,
        )
        if not fetch_res.get('ok'):
            if fetch_res.get('auth_error'):
                return Response(
                    {'error': fetch_res['error'], 'authenticated': False},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {'error': fetch_res.get('error', 'Failed to fetch sheet content'), 'details': fetch_res.get('details', {})},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rows = fetch_res.get('rows', [])
        if not rows:
            return Response({'message': 'Sheet is empty', 'imported': 0, 'skipped': 0, 'failed': 0})

        sync_res = sync_campaign_sheet_rows(
            campaign=campaign,
            rows=rows,
            force_full_sync=force_full_sync,
            previous_last_synced_row=previous_last_synced_row,
        )
        if not sync_res.get('ok'):
            return Response({'error': sync_res.get('error', 'Sync failed')}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'message': sync_res['message'],
            'imported': sync_res['imported'],
            'added': sync_res['added'],
            'duplicates': sync_res['duplicates'],
            'skipped': sync_res['skipped'],
            'failed': sync_res['failed'],
            'already_synced': sync_res['already_synced'],
            'last_row': sync_res['last_row'],
        })
