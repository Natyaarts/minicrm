import requests
import os
from django.conf import settings

class WiseService:
    def __init__(self):
        self.host = os.getenv('WISE_API_HOST', 'api.wiseapp.live')
        self.api_key = os.getenv('WISE_API_KEY')
        self.user_id = os.getenv('WISE_USER_ID')
        self.institute_id = os.getenv('WISE_INSTITUTE_ID')
        self.namespace = os.getenv('WISE_NAMESPACE')
        
    def get_headers(self):
        import base64
        # wise_user_id is required for Basic Auth
        if not self.user_id or not self.api_key:
            return {}
            
        auth_str = f"{self.user_id}:{self.api_key}"
        auth_base64 = base64.b64encode(auth_str.encode()).decode()
        
        return {
            'Authorization': f'Basic {auth_base64}',
            'x-api-key': self.api_key,
            'x-wise-namespace': self.namespace,
            'user-agent': f'VendorIntegrations/{self.namespace}',
            'Content-Type': 'application/json'
        }

    def get_student_fee_summary(self, lms_student_id):
        """
        Fetches student fee summary.
        URL: /institutes/{institute_id}/studentFees?studentId={student_id}&page_size=100
        """
        if not self.api_key or not lms_student_id:
            return None
            
        try:
            url = f"https://{self.host}/institutes/{self.institute_id}/studentFees?studentId={lms_student_id}&page_size=100"
            response = requests.get(url, headers=self.get_headers(), timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 200:
                    return data.get('data') or {}
            return None
        except Exception as e:
            print(f"Wise API Fee Summary Error: {e}")
            return None

    def get_institute_transactions(self, start_date=None, end_date=None):
        """
        Fetches institute transactions from Wise LMS, handling pagination automatically.
        URL: /institutes/{institute_id}/fees/transactions
        """
        if not self.api_key:
            return None
            
        all_transactions = []
        page = 1
        headers = self.get_headers()
        
        while True:
            try:
                url = f"https://{self.host}/institutes/{self.institute_id}/fees/transactions"
                params = {
                    "type": "PAYMENT,OFFLINE_PAYMENT",
                    "status": "CHARGED",
                    "populateParticipant": "true",
                    "populateClassroom": "true",
                    "page_size": 50,
                    "page_number": page
                }
                if start_date:
                    params["startDate"] = start_date
                if end_date:
                    params["endDate"] = end_date
                    
                response = requests.get(url, headers=headers, params=params, timeout=10)
                if response.status_code != 200:
                    break
                    
                data = response.json()
                if data.get('status') != 200:
                    break
                    
                result_data = data.get('data') or {}
                transactions = result_data.get('transactions') or []
                if not transactions:
                    break
                    
                all_transactions.extend(transactions)
                
                # If we retrieved fewer than page_size, we are done
                if len(transactions) < 50:
                    break
                    
                page += 1
                if page > 100:  # safety break
                    break
            except Exception as e:
                print(f"Wise API Transactions Error on page {page}: {e}")
                break
                
        return {"transactions": all_transactions}

    # Keeping original get_student_details as a wrapper or deprecated
    def get_student_details(self, lms_student_id):
        # Redirect to fee summary for now as it contains the most critical info
        return self.get_student_fee_summary(lms_student_id)

    def get_profile_and_progress(self, lms_student_id):
        try:
            url = f"https://{self.host}/institutes/{self.institute_id}/users/{lms_student_id}/profile"
            response = requests.get(url, headers=self.get_headers(), timeout=10)
            if response.status_code == 200:
                return response.json()
            return None
        except Exception as e:
            print(f"Wise API Error: {e}")
            return None

    def get_live_stats(self, lms_student_id):
        # Specific endpoint for live session stats if available
        try:
            url = f"https://{self.host}/institutes/{self.institute_id}/users/{lms_student_id}/live-stats"
            # If that fails, we might just rely on the main stats from profile or similar
            # Since exact endpoint is unknown, we return empty for now unless we find one
            return {}
        except:
            return {}

    def search_student_by_phone(self, phone):
        """
        Searches for a student by phone using the V3 API.
        Iterates through pages to ensure all potential matches are checked.
        """
        if not self.api_key:
            return None
        
        # Strip to last 10 digits
        clean_phone = str(phone).replace(" ", "")[-10:]
            
        try:
            url = f"https://{self.host}/institutes/v3/{self.institute_id}/students"
            headers = self.get_headers()
            
            # Helper to search with a specific query param
            def fetch_all_matches(query_param, value):
                page = 1
                found_students = []
                while True:
                    params = {
                        "page_size": 100, 
                        "page_number": page,
                        query_param: value
                    }
                    res = requests.get(url, headers=headers, params=params, timeout=10)
                    if res.status_code != 200:
                        break
                    
                    data = res.json()
                    # V3 Structure: { data: { students: [...], count: N } }
                    batch = data.get('data', {}).get('students', [])
                    if not batch:
                        break
                        
                    found_students.extend(batch)
                    
                    # If batch is less than page_size, we've reached the end
                    if len(batch) < 100:
                        break
                    page += 1
                    
                    # Safety break
                    if page > 10: break 
                return found_students

            # 1. Search by 'mobile' query param (Exact match preferred)
            students = fetch_all_matches("mobile", clean_phone)
            if students: return students[0]
            
            # 2. Try with +91 prefix
            students = fetch_all_matches("mobile", f"+91{clean_phone}")
            if students: return students[0]

            # 3. Search by general 'search' query param (Iterate to find match)
            students = fetch_all_matches("search", clean_phone)
            
            # Filter specifically for phone match to avoid partial matches on other fields
            for s in students:
                s_mobile = str(s.get('mobile', '')).replace(" ", "")
                # Check both ways to be safe (clean_phone is last 10 digits)
                if clean_phone in s_mobile:
                    return s
                    
            return None
        except Exception as e:
            print(f"Wise API Search Error (V3): {e}")
            return None

    def get_all_students(self):
        """
        Generator that yields all students from Wise LMS, handling pagination automatically.
        """
        if not self.api_key:
            return

        url = f"https://{self.host}/institutes/v3/{self.institute_id}/students"
        headers = self.get_headers()
        page = 1
        
        while True:
            try:
                params = {
                    "page_size": 50,  # Reduced from 200 to avoid 400 Bad Request
                    "page_number": page
                }
                # print(f"Fetching {page} with params: {params}") # Debug
                res = requests.get(url, headers=headers, params=params, timeout=10)
                if res.status_code != 200:
                    print(f"Wise Sync Error on page {page}: {res.status_code} {res.text}")
                    break
                
                data = res.json()
                # V3 Structure: { data: { students: [...], count: N } }
                students = data.get('data', {}).get('students', [])
                
                if not students:
                    break
                    
                for student in students:
                    yield student
                
                # If we got fewer than requested, we are done
                if len(students) < 50:
                    break
                    
                page += 1
                
                # Safety limit to prevent infinite loops in dev
                if page > 100: 
                    print("Reached safety page limit (100)")
                    break
                    
            except Exception as e:
                print(f"Wise Sync Exception on page {page}: {e}")
                break
    # Adding student reports
    def get_student_reports(self, lms_student_id):
        """
        Fetches student reports (progress, assessment results, etc.)
        URL: https://api.wiseapp.live/public/institutes/{institute_id}/studentReports/{student_id}
        """
        if not self.api_key or not lms_student_id:
            return None
        try:
            url = f"https://{self.host}/public/institutes/{self.institute_id}/studentReports/{lms_student_id}"
            response = requests.get(url, headers=self.get_headers(), timeout=10)
            if response.status_code == 200:
                return response.json()
            return None
        except Exception as e:
            print(f"Wise API Student Reports Error: {e}")
            return None

    def get_registration_data(self, lms_student_id):
        """
        Fetches student registration data.
        URL: https://api.wiseapp.live/institutes/{institute_id}/participants/{student_id}?showRegistrationData=true
        """
        if not self.api_key or not lms_student_id:
            return None
        try:
            url = f"https://{self.host}/institutes/{self.institute_id}/participants/{lms_student_id}?showRegistrationData=true"
            response = requests.get(url, headers=self.get_headers(), timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 200:
                    return data.get('data') or {}
            return None
        except Exception as e:
            print(f"Wise API Registration Data Error: {e}")
            return None

    def consume_credits(self, lms_student_id, class_id, credit, note="Consuming Credits", credit_type="DEBIT"):
        """
        Marks credits as consumed for a student.
        URL: POST https://api.wiseapp.live/institutes/{institute_id}/classes/{class_id}/students/{student_id}/sessionCredits
        """
        if not self.api_key or not lms_student_id or not class_id:
            return None
        try:
            url = f"https://{self.host}/institutes/{self.institute_id}/classes/{class_id}/students/{lms_student_id}/sessionCredits"
            payload = {
                "credit": str(credit),
                "note": note,
                "type": credit_type
            }
            response = requests.post(url, headers=self.get_headers(), json=payload, timeout=10)
            if response.status_code == 200:
                return response.json()
            return None
        except Exception as e:
            print(f"Wise API Consume Credits Error: {e}")
            return None

    def get_all_courses(self, class_type="LIVE"):
        # Wrapper for get_course_list
        return self.get_course_list(class_type)

    def get_course_list(self, type="LIVE"):
        """
        Fetches all courses (classes) in the institute using V2.
        URL: https://api.wiseapp.live/institutes/{institute_id}/classes?classType={type}
        """
        if not self.api_key:
            return []
        try:
            # Use V2 as primary for this account
            url = f"https://{self.host}/institutes/{self.institute_id}/classes"
            params = {"classType": type} if type else {}
            
            response = requests.get(url, headers=self.get_headers(), params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                # V2 structure: { data: { classes: [...] } }
                result_data = data.get('data') or {}
                if isinstance(result_data, list):
                    return result_data
                return result_data.get('classes') or []
            return []
        except Exception as e:
            print(f"Wise API Course List Error (V2): {e}")
            return []

    def get_course_details(self, class_id):
        """
        Fetches detailed course information including fees.
        URL: https://api.wiseapp.live/user/v2/classes/{class_id}?full=true
        """
        if not self.api_key or not class_id:
            return None
        try:
            url = f"https://{self.host}/user/v2/classes/{class_id}?full=true"
            response = requests.get(url, headers=self.get_headers(), timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 200:
                    return data.get('data') or {}
            return None
        except Exception as e:
            print(f"Wise API Course Details Error: {e}")
            return None

    def get_class_participants(self, class_id):
        """
        Fetches all participants (students) for a specific class/batch.
        URL: https://api.wiseapp.live/user/classes/{class_id}/participants?showCoTeachers=true
        """
        if not self.api_key or not class_id:
            return []
        try:
            url = f"https://{self.host}/user/classes/{class_id}/participants?showCoTeachers=true"
            response = requests.get(url, headers=self.get_headers(), timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 200:
                    # Participants are usually in joinedRequest array
                    # data format: { data: { joinedRequest: [...] } }
                    result_data = data.get('data') or {}
                    return result_data.get('joinedRequest') or []
            return []
        except Exception as e:
            print(f"Wise API Get Participants Error: {e}")
            return []
    def get_session_logs(self, class_id):
        """
        Fetches all live session logs for a specific class (Zoom meetings history).
        URL: https://api.wiseapp.live/institutes/{institute_id}/sessions?classId={class_id}&paginateBy=COUNT&page_number=1&page_size=100
        """
        if not self.api_key or not class_id:
            return []
        try:
            url = f"https://{self.host}/institutes/{self.institute_id}/sessions?classId={class_id}&paginateBy=COUNT&page_number=1&page_size=100"
            response = requests.get(url, headers=self.get_headers(), timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 200:
                    result_data = data.get('data') or {}
                    return result_data.get('sessions') or []
            return []
        except Exception as e:
            print(f"Wise API Session Logs Error: {e}")
            return []

    def get_all_teachers(self):
        """
        Fetches all teachers/instructors from Wise LMS by scanning class details (V2 coTeachers).
        """
        if not self.api_key:
            return []
            
        try:
            unique_teachers = {}
            # Scan LIVE classes to find active teachers
            classes = self.get_course_list(type="LIVE")
            
            # Since we have many classes, we scan them to find unique teachers
            # To avoid too many API calls, we scan the first 50 or those with recent activity
            for cls in classes[:50]: 
                cls_id = cls.get('_id') or cls.get('id')
                if not cls_id: continue
                
                details = self.get_course_details(cls_id)
                if not details: continue
                
                # Check co-teachers (this is where the data is on this account)
                co_teachers = details.get('coTeachers') or details.get('co_teachers') or []
                # Also check primary instructor just in case
                instructor = details.get('instructor')
                
                staff_list = co_teachers + ([instructor] if instructor else [])
                
                for staff in staff_list:
                    if not staff: continue
                    s_id = str(staff.get('_id') or staff.get('id'))
                    if s_id and s_id not in unique_teachers:
                        unique_teachers[s_id] = staff

            if unique_teachers:
                return list(unique_teachers.values())
        except Exception as e:
            print(f"V2 Detail Scan Error: {e}")
            
        return []
