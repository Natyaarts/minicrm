# Natya Arts Custom CRM - Complete Developer & API Reference

Welcome to the central developer documentation for the Natya Arts CRM system. This project is built as a split-architecture system:
- **Backend**: Python 3 Django & Django Rest Framework (DRF) running in the `[backend/](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/backend)` directory.
- **Frontend**: JavaScript React, TailwindCSS, Vite running in the `[frontend/](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend)` directory.

---

## Technical Architecture & Setup

### Base URL & Global Headers
All API calls must contain the following settings:
- **Development Server URL**: `http://localhost:8000`
- **Production Server URL**: `/api/` (Proxied via Nginx)
- **CORS Allowed Origins**: Enabled for `http://localhost:5173`, `http://13.232.192.160:5173`, and `https://natyaarts.org`.
- **Global Headers**:
  - `Content-Type: application/json`
  - `Authorization: Token <key>` (Required for all endpoints unless explicitly marked as **Public/AllowAny**)

### Authentication Middleware & Role-Based Access Control (RBAC)
The backend validates headers using DRF Token-Based Authentication (`rest_framework.authentication.TokenAuthentication`). 
API authorization is governed by the custom permission class `[DynamicRolePermission](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/backend/core/permissions.py)`:
- `SUPER_ADMIN` and `is_superuser` accounts skip all checks and have full administrative permissions.
- Other roles are checked against the `RolePermission` model matching the user's role and the view's defined `module_name`:
  - `SAFE_METHODS` (GET, HEAD, OPTIONS) require `can_view = True`.
  - `POST` requires `can_add = True`.
  - `PUT`/`PATCH` require `can_edit = True`.
  - `DELETE` requires `can_delete = True`.

---

## 0. Authentication & Access Control

### User Login & Token Retrieval
*   **Backend Functionality**: Authenticates users against the Django custom user database, generates or retrieves their API Token, and returns the serialized user profile details (including their direct role permissions mapping for frontend routing convenience).
*   **REST API Endpoints**:
    *   `POST /api/auth/login/` (Public / AllowAny)
        *   **Description**: Validates credentials and returns an authentication token.
        *   **Payload**:
            ```json
            {
              "username": "admin",
              "password": "securepassword"
            }
            ```
        *   **Response**:
            ```json
            {
              "token": "a1b2c3d4e5f6g7h8i9j0",
              "user": {
                "id": 1,
                "username": "admin",
                "email": "admin@natyaarts.org",
                "first_name": "Lead",
                "last_name": "Admin",
                "role": "SUPER_ADMIN",
                "phone_number": "9876543210",
                "permissions": {},
                "teacher_batches_details": [],
                "total_classes_conducted": 0,
                "lms_teacher_id": null
              }
            }
            ```
*   **Frontend API Calls Trace**:
    *   Consumed by `[AuthContext.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/context/AuthContext.jsx)`.

---

### Identity Check
*   **Backend Functionality**: Resolves the active user's details and active role permission dictionary based on the provided token header.
*   **REST API Endpoints**:
    *   `GET /api/auth/me/` (IsAuthenticated)
        *   **Description**: Returns details and permission map of the currently logged-in user.
        *   **Response**: Same as the `user` object in the login response.
*   **Frontend API Calls Trace**:
    *   Consumed by `[AuthContext.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/context/AuthContext.jsx)` on application startup to verify local storage tokens.

---

### Staff & Faculty Lookups
*   **Backend Functionality**: Fetches flat lists of staff members filtered by security roles to populate select dropdowns in coordinator assignment views.
*   **REST API Endpoints**:
    *   `GET /api/auth/mentors/` (IsAuthenticated)
        *   **Description**: Lists users with role MENTOR, ACADEMIC, ACADEMIC_COORDINATOR, ADMIN, or SUPER_ADMIN.
    *   `GET /api/auth/teachers/` (IsAuthenticated)
        *   **Description**: Lists users with role TEACHER.
*   **Frontend API Calls Trace**:
    *   Consumed by `[AcademicCoordinatorModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/AcademicCoordinatorModule.jsx)`.

---

### User & Directory Management
*   **Backend Functionality**: Allows administrative accounts to create, read, update, or remove CRM users. Supports role filtering and search query parameters.
*   **REST API Endpoints**:
    *   `GET /api/auth/management/users/` (IsAdminUser)
        *   **Query Params**: 
            *   `?role=<ROLE_NAME>` (e.g. MENTOR, SALES, TEACHER, STUDENT)
            *   `?search=<query>` (filters by username, email, first_name, last_name)
            *   `?page=<number>` (paginated list query)
    *   `POST /api/auth/management/users/` (IsAdminUser)
        *   **Description**: Registers a new user account.
        *   **Payload**:
            ```json
            {
              "username": "jane_doe",
              "email": "jane@example.com",
              "password": "strongpassword123",
              "role": "SALES",
              "first_name": "Jane",
              "last_name": "Doe",
              "phone_number": "9998887776"
            }
            ```
    *   `GET/PUT/PATCH/DELETE /api/auth/management/users/<id>/` (IsAdminUser)
        *   **Description**: Retrieves, updates, or deletes a specific user record.
*   **Frontend API Calls Trace**:
    *   Consumed by `[UsersModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/UsersModule.jsx)`.

---

### Teacher / Faculty Management
*   **Backend Functionality**: Manages faculty records for teaching staff. Automatically forces the role to `TEACHER` and sets a default password `welcome123` if none is provided on creation.
*   **REST API Endpoints**:
    *   `GET/POST/PUT/PATCH/DELETE /api/auth/management/teachers/` (DynamicRolePermission - Module: `ACADEMIC`)
        *   **Description**: Manages users with roles TEACHER, MENTOR, ACADEMIC, or ACADEMIC_COORDINATOR.
        *   **Payload (POST)**: Same format as standard user creation; role will be forced to `TEACHER` and password defaults to `welcome123`.
*   **Frontend API Calls Trace**:
    *   Consumed by `[TeacherModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/TeacherModule.jsx)`.

---

### RBAC Permission Mapping
*   **Backend Functionality**: Assigns module-level access flags (can_view, can_add, can_edit, can_delete) to specific security roles in the database.
*   **REST API Endpoints**:
    *   `GET /api/auth/management/permissions/` (IsAdminUser)
        *   **Query Params**: `?role=<ROLE_NAME>` (e.g. MENTOR)
    *   `POST/PUT/PATCH/DELETE /api/auth/management/permissions/` (IsAdminUser)
        *   **Payload (POST)**:
            ```json
            {
              "role": "MENTOR",
              "module": "COURSES",
              "can_view": true,
              "can_add": false,
              "can_edit": true,
              "can_delete": false
            }
            ```
*   **Frontend API Calls Trace**:
    *   Consumed by the security configuration panel in `[AdminModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/AdminModule.jsx)`.

---

## 1. Academic & LMS Modules

### Dashboard
*   **Backend Functionality**: Aggregates high-level metrics for active students, total batches, revenue from transactions, unassigned leads, and operational expenses. Enforces role-based data isolation (mentors/teachers only see stats for their own assigned batches, while sales/analytics have broader access).
*   **REST API Endpoints**:
    *   `GET /api/dashboard-stats/` (Token Required)
        *   **Description**: Retrieves counts, distribution arrays, and expenses.
        *   **Response**:
            ```json
            {
              "students": 45,
              "batches": 5,
              "revenue": 150000.00,
              "leads": 12,
              "distribution": [{"name": "Natya Arts", "value": 30}, {"name": "STED", "value": 15}],
              "revenue_distribution": [{"name": "Natya Arts", "value": 100000}, {"name": "STED", "value": 50000}],
              "expenses": 45000.0,
              "total_expenses": 240000.0
            }
            ```
*   **Frontend API Calls Trace**:
    *   Consumed by `[Dashboard.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/Dashboard.jsx)` upon loading.

---

### Sales / Leads
*   **Backend Functionality**: Registers new public student applications, matches incoming leads, performs lookup check validations, restores soft-deleted students, and enables bulk data imports from Excel/CSV templates using `pandas` within atomic database transactions.
*   **REST API Endpoints**:
    *   `POST /api/students/` (AllowAny / Public)
        *   **Description**: Receives public student applications. Sends automated alerts to all Sales/Admin users.
        *   **Payload**:
            ```json
            {
              "first_name": "John",
              "last_name": "Doe",
              "email": "john.doe@example.com",
              "mobile": "9876543210",
              "program_type": 1,
              "dynamic_values": {"1": "Yes"}
            }
            ```
    *   `GET /api/students/` (DynamicRolePermission - Module: `SALES`)
        *   **Query Params**: 
            *   `?unassigned=true` (filters leads not in a batch)
            *   `?is_active=false` (filters deleted records)
            *   `?program=<id>` (filters by Program)
            *   `?sub_program=<id>` (filters by Sub-Program)
            *   `?course=<id>` (filters by Course)
            *   `?batch=<id>` (filters by Batch)
    *   `GET /api/students/public_lookup/` (AllowAny)
        *   **Query Params**: `?mobile=9876543210` or `?sid=1`
        *   **Description**: Verifies if an active student profile exists.
    *   `POST /api/students/<id>/restore/` (DynamicRolePermission - Module: `SALES`)
        *   **Description**: Restores soft-deleted student records.
    *   `POST /api/students/<id>/permanent_delete/` (DynamicRolePermission - Module: `SALES`)
        *   **Description**: Hard-deletes student records from the database.
    *   `POST /api/bulk/upload-students/` (DynamicRolePermission - Module: `SALES`)
        *   **Headers**: `Content-Type: multipart/form-data`
        *   **Payload**: `file` (Multipart file upload)
        *   **Description**: Parses CSV/Excel columns, registers users, and updates student details.
    *   `GET /api/students/export_csv/` (DynamicRolePermission - Module: `SALES`)
        *   **Description**: Generates and downloads a CSV spreadsheet list of all active/filtered students using `pandas`.
        *   **Response**: `text/csv` file attachment (`students.csv`).
    *   `POST /api/students/<id>/set_credentials/` (IsAuthenticated)
        *   **Description**: Sets or updates username and password for a student's associated User account. Mentors can only update credentials of students within their assigned batches.
        *   **Payload**:
            ```json
            {
              "username": "johndoe123",
              "password": "securepassword123"
            }
            ```
        *   **Response**:
            ```json
            {
              "status": "Credentials updated successfully"
            }
            ```
*   **Frontend API Calls Trace**:
    *   Consumed by `[SalesModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/SalesModule.jsx)`, `[PublicApplicationForm.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/PublicApplicationForm.jsx)`, and `[Dashboard.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/Dashboard.jsx)`.

---

### Mentor Module
*   **Backend Functionality**: Allows assigned mentors to view their batches, enroll students, remove students, track syllabus completion, and log live sessions. Restricts access via `IsMentorOwner` permission class.
*   **REST API Endpoints**:
    *   `GET /api/batches/` (IsAuthenticated - Mentors only see their own assigned batches)
    *   `POST /api/batches/<id>/add_student/` (IsAuthenticated)
        *   **Payload**: `{"student_id": 4}`
    *   `POST /api/batches/<id>/remove_student/` (IsAuthenticated)
        *   **Payload**: `{"student_id": 4}`
    *   `POST /api/batches/<id>/bulk_add_students/` (IsAuthenticated)
        *   **Description**: Assigns multiple students to a batch in a single operation. Automatically issues system notifications for assignments.
        *   **Payload**:
            ```json
            {
              "student_ids": [4, 5, 6]
            }
            ```
        *   **Response**:
            ```json
            {
              "status": "Students added"
            }
            ```
    *   `POST /api/batches/<id>/log_session/` (IsAuthenticated)
        *   **Description**: Records ClassSession and submits student attendance in a single action.
        *   **Payload**:
            ```json
            {
              "date": "2026-05-21",
              "teacher_summary": "Introduction to Kathakali. Duration: 3600000",
              "completed_parts": [1, 2],
              "attendance": {
                "4": true,
                "5": false
              }
            }
            ```
*   **Frontend API Calls Trace**:
    *   Consumed by `[MentorModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/MentorModule.jsx)`.

---

### Student Portal
*   **Backend Functionality**: Allows student users to access their own academic progress, Wise LMS live session attendance percentages, remaining due fees synchronizations, scheduled exams, and published mark sheets.
*   **REST API Endpoints**:
    *   `GET /api/auth/me/` (IsAuthenticated)
        *   **Description**: Retrieves logged-in user profile.
    *   `GET /api/students/` (IsAuthenticated - filters queryset to only request.user)
    *   `GET /api/integrations/details/` (IsAuthenticated)
        *   **Query Params**: `?student_id=<id>`
        *   **Description**: Fetches live fee details, Zoom activity, and course completion percentages from Wise LMS.
    *   `GET /api/batches/<batch_id>/` (IsAuthenticated)
        *   **Description**: Retrieves details of the batch, including class sessions, teachers, and exams.
    *   `POST /api/student-submissions/` (IsAuthenticated - **Note**: Viewset fully coded but unregistered in backend urls, see Developer Quality Insights section)
        *   **Description**: Saves and automatically scores multiple-choice questions (MCQs) by comparing submitted answers against correct options defined in the database.
        *   **Payload**:
            ```json
            {
              "exam": 1,
              "student": 4,
              "start_time": "2026-05-21T15:00:00Z",
              "end_time": "2026-05-21T16:00:00Z",
              "is_submitted": true,
              "answers_json": {
                "10": 34,
                "11": 38
              }
            }
            ```
        *   **Response**:
            ```json
            {
              "id": 1,
              "exam": 1,
              "student": 4,
              "start_time": "2026-05-21T15:00:00Z",
              "end_time": "2026-05-21T16:00:00Z",
              "is_submitted": true,
              "answers_json": {
                "10": 34,
                "11": 38
              },
              "score": 10
            }
            ```
*   **Frontend API Calls Trace**:
    *   Consumed by `[StudentPortal.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/StudentPortal.jsx)`.

---

### Academic Hierarchy
*   **Backend Functionality**: Configures the institutional core catalog structures consisting of Programs, Sub-Programs, Courses, and Batches.
*   **REST API Endpoints**:
    *   `GET /api/programs/` (AllowAny / IsAuthenticated)
    *   `GET /api/programs/hierarchy/` (AllowAny)
        *   **Description**: Returns a nested JSON structure of all programs, sub-programs, and courses.
        *   **Response**:
            ```json
            [
              {
                "id": 1,
                "name": "Natya Arts",
                "sub_programs": [
                  {
                    "id": 1,
                    "name": "STED Council",
                    "courses": [
                      {"id": 1, "name": "Kathak Diploma", "fee_amount": "25000.00"}
                    ]
                  }
                ]
              }
            ]
            ```
    *   `POST /api/programs/` (IsAdminUser)
    *   `POST /api/sub-programs/` (IsAdminUser)
    *   `POST /api/courses/` (IsAdminUser)
    *   `POST /api/batches/` (IsAdminUser)
*   **Frontend API Calls Trace**:
    *   Consumed by `[AcademicModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/AcademicModule.jsx)` and `[AdminModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/AdminModule.jsx)`.

---

### Coordinator Module
*   **Backend Functionality**: Coordinates assignment matrices. Academic Coordinators can link teachers to batches, change primary/secondary mentors, and manually initiate background imports from Wise LMS.
*   **REST API Endpoints**:
    *   `GET /api/auth/mentors/` (IsAuthenticated)
        *   **Description**: Returns active coordinators, admins, and mentors.
    *   `PATCH /api/batches/<id>/` (IsAuthenticated)
        *   **Payload**: `{"primary_mentor": 2, "teacher": 4}`
*   **Frontend API Calls Trace**:
    *   Consumed by `[AcademicCoordinatorModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/AcademicCoordinatorModule.jsx)`.

---

### Teacher Module
*   **Backend Functionality**: Allows teachers to log class sessions, take student attendance, create examinations, add grading sheets, and compile questions.
*   **REST API Endpoints**:
    *   `GET /api/auth/management/teachers/` (DynamicRolePermission - Module: `ACADEMIC`)
    *   `POST /api/auth/management/teachers/` (DynamicRolePermission - Module: `ACADEMIC`)
    *   `POST /api/class-sessions/` (DynamicRolePermission - Module: `TEACHER`)
    *   `POST /api/attendances/bulk_submit/` (DynamicRolePermission - Module: `TEACHER`)
    *   `POST /api/exams/` (DynamicRolePermission - Module: `TEACHER`)
        *   **Payload**: `{"title": "Midterm Exam", "batch": 1, "date": "2026-06-01", "total_marks": 100}`
    *   `PATCH /api/exams/<id>/` (DynamicRolePermission - Module: `TEACHER`)
        *   **Payload**: `{"is_published": true}`
    *   `POST /api/questions/` (DynamicRolePermission - Module: `TEACHER`)
    *   `POST /api/exam-results/bulk_submit/` (DynamicRolePermission - Module: `TEACHER`)
        *   **Payload**:
            ```json
            {
              "exam_id": 5,
              "results": {
                "12": {"marks": 85, "remarks": "Excellent performance", "is_present": true},
                "14": {"marks": 0, "remarks": "Absent", "is_present": false}
              }
            }
            ```
*   **Frontend API Calls Trace**:
    *   Consumed by `[TeacherModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/TeacherModule.jsx)`.

---

### Courses
*   **Backend Functionality**: Dynamically renders admission form custom fields mapped specifically to program/course selections, and manages course syllabus outlines (`SyllabusPart`) and batch shared resources (`BatchResource`).
*   **REST API Endpoints**:
    *   `GET /api/forms/fields/` (AllowAny)
        *   **Query Params**: `?course=<id>&field_group=INITIAL`
        *   **Description**: Traverses the hierarchy (Course $\rightarrow$ SubProgram $\rightarrow$ Program) and resolves custom fields.
    *   `POST /api/forms/fields/` (IsAdminUser)
    *   `DELETE /api/forms/fields/<id>/` (IsAdminUser)
    *   `GET /api/syllabus-parts/` (IsAuthenticated)
        *   **Query Params**: `?batch=<id>`
    *   `POST/PATCH/DELETE /api/syllabus-parts/` (IsAuthenticated)
        *   **Description**: Allows instructors to define, modify, or delete syllabus checklist outline units for batches.
        *   **Payload (POST)**:
            ```json
            {
              "batch": 1,
              "title": "Module 1: Basic Adavus",
              "order": 1,
              "is_completed": false
            }
            ```
    *   `GET/POST/DELETE /api/batch-resources/` (IsAuthenticated)
        *   **Description**: Handles shared batch materials like YouTube links, reference PDFs, and lecture notes.
        *   **Query Params (GET)**: `?batch=<id>`
        *   **Payload (POST)**:
            ```json
            {
              "batch": 1,
              "title": "Intro to Bharatanatyam PDF",
              "resource_type": "DOCUMENT",
              "url": "http://example.com/doc.pdf"
            }
            ```
*   **Frontend API Calls Trace**:
    *   Consumed by `[CoursesModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/CoursesModule.jsx)`, `[TeacherModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/TeacherModule.jsx)`, and `[AdminModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/AdminModule.jsx)`.

---

### Analytics
*   **Backend Functionality**: Compiles administrative reports on financial balances (Potential revenue vs Collected fees vs Outstanding balance) and traces teacher session hours by scanning duration tags in summaries (e.g. `"Duration: 3600000"`).
*   **REST API Endpoints**:
    *   `GET /api/analytics-details/` (DynamicRolePermission - Module: `ANALYTICS`)
        *   **Response**:
            ```json
            {
              "teachers_count": 8,
              "students_count": 45,
              "batches_count": 5,
              "revenue_metrics": {"potential": 500000, "collected": 350000, "due": 150000},
              "teacher_performance": [
                {
                  "id": 4,
                  "name": "Jane Doe",
                  "courses": 2,
                  "sessions": 15,
                  "hours": 15.0,
                  "formatted_time": "15h 0m",
                  "classes": [
                    {
                      "batch_name": "Kathak Batch A",
                      "sessions": 10,
                      "formatted_time": "10h 0m"
                    }
                  ]
                }
              ]
            }
            ```
    *   `GET /api/students/due_students/` (DynamicRolePermission - Module: `SALES`)
        *   **Description**: Retrieves a list of students who have outstanding due balances (i.e. course fee exceeds total transaction credits).
*   **Frontend API Calls Trace**:
    *   Consumed by `[AnalyticsModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/AnalyticsModule.jsx)`.

---

## 2. HRMS Modules

### HRMS Module / Workforce Hub
*   **Backend Functionality**: Manages corporate registers of workforce staff, departments, job designations, base salaries, shift schedules, and custom properties stored in employee profiles.
*   **REST API Endpoints**:
    *   `GET/POST /api/hrms/departments/` (IsAuthenticated)
    *   `GET/POST /api/hrms/designations/` (IsAuthenticated)
    *   `GET/POST/PATCH/DELETE /api/hrms/employees/` (IsAuthenticated - non-admin is restricted to query own profile)
    *   `GET/POST/DELETE /api/hrms/custom-fields/` (IsAuthenticated)
        *   **Description**: Performs operations on custom database fields dynamically appended to employee onboarding forms.
        *   **Payload (POST)**:
            ```json
            {
              "field_name": "Emergency Contact Name",
              "field_type": "TEXT",
              "is_required": true
            }
            ```
*   **Frontend API Calls Trace**:
    *   Consumed by `[HRMSModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/HRMSModule.jsx)`.

---

### Attendance
*   **Backend Functionality**: Implements geofenced check-ins and check-outs. When an employee clocks in, their location coordinates are compared against active shift coordinates using the **Haversine formula**:
    $$d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \text{lat}}{2}\right) + \cos(\text{lat}_1)\cos(\text{lat}_2)\sin^2\left(\frac{\Delta \text{lon}}{2}\right)}\right)$$
    Where $R = 6371 \text{ km}$. If $d > \text{allowed radius}$, the request is rejected. Checks late limits (`grace_period_minutes`) and automatically marks the status as `LATE` or `PRESENT`.
*   **REST API Endpoints**:
    *   `POST /api/hrms/attendance/clock_in/` (IsAuthenticated)
        *   **Payload**: `{"latitude": 11.258753, "longitude": 75.780410}`
    *   `POST /api/hrms/attendance/clock_out/` (IsAuthenticated)
        *   **Payload**: `{"latitude": 11.258753, "longitude": 75.780410}`
    *   `GET /api/hrms/attendance/` (IsAuthenticated - employees see own, admin sees all)
    *   `GET/POST/PATCH /api/hrms/shifts/` (IsAuthenticated)
        *   **Description**: Manages shift timings, late grace periods, geofencing office coordinates, and boundary rules.
        *   **Payload (POST)**:
            ```json
            {
              "name": "General Shift",
              "start_time": "09:00:00",
              "end_time": "17:00:00",
              "grace_period_minutes": 15,
              "office_latitude": 11.258753,
              "office_longitude": 75.780410,
              "allowed_radius_meters": 100,
              "is_active": true
            }
            ```
*   **Frontend API Calls Trace**:
    *   Consumed by `[AttendanceModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/AttendanceModule.jsx)`.

---

### Payroll
*   **Backend Functionality**: Calculates monthly salary structures, deductions, LOP, company loans, and renders payslip PDFs.
    - **LOP days calculation**: 
      $$\text{LOP Days} = \text{Unexcused Absences} + (0.5 \times \text{Half Days}) + \text{Unpaid Leaves}$$
    - **Prorated calculation**:
      $$\text{Net Salary} = \left(\frac{\text{Base Salary} + \text{Allowances}}{\text{Days in Month}} \times (\text{Days} - \text{LOP})\right) - \text{PF/Tax/Deductions} - \text{Loan Repayment}$$
*   **REST API Endpoints**:
    *   `GET/POST/DELETE/PATCH /api/payroll/salary-structures/` (IsAuthenticated)
        *   **Description**: Manages base compensation structures and default tax/deduction settings for employees.
    *   `POST /api/payroll/payslips/generate_all/` (IsAuthenticated)
        *   **Payload**: `{"month": 5, "year": 2026}`
    *   `POST /api/payroll/payslips/<id>/mark_as_paid/` (IsAuthenticated)
        *   **Payload**: `{"payment_method": "BANK_TRANSFER"}`
    *   `GET /api/payroll/payslips/<id>/download_pdf/` (IsAuthenticated - downloads custom PDF generated using `fpdf2`)
    *   `GET/POST /api/payroll/adjustments/` (IsAuthenticated)
        *   **Description**: Handles one-off salary amendments such as bonuses or penalties applied to a specific cycle.
        *   **Payload (POST)**:
            ```json
            {
              "employee": 2,
              "month": 5,
              "year": 2026,
              "amount": 2500.00,
              "adjustment_type": "BONUS",
              "reason": "Outstanding performance"
            }
            ```
    *   `GET/POST/PATCH/DELETE /api/payroll/loans/` (IsAuthenticated)
        *   **Description**: Configures employee salary loans, tracked repayment installment plans, and outstanding balances.
        *   **Payload (POST)**:
            ```json
            {
              "employee": 2,
              "loan_amount": 30000.00,
              "monthly_repayment": 3000.00,
              "balance_amount": 30000.00,
              "is_active": true
            }
            ```
*   **Frontend API Calls Trace**:
    *   Consumed by `[PayrollModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/PayrollModule.jsx)`.

---

### Leave Management
*   **Backend Functionality**: Tracks leave balances, excludes Sundays and registered `Holiday` records during duration calculations, and manages approvals.
*   **REST API Endpoints**:
    *   `GET /api/leaves/balances/` (IsAuthenticated)
    *   `POST /api/leaves/requests/` (IsAuthenticated)
    *   `POST /api/leaves/requests/<id>/approve/` (SUPER_ADMIN)
    *   `POST /api/leaves/requests/<id>/reject/` (SUPER_ADMIN)
        *   **Payload**: `{"rejection_reason": "Not enough staff"}`
    *   `GET/POST/DELETE /api/leaves/types/` (IsAuthenticated)
        *   **Description**: Controls institutional leave catalog classifications (e.g. Casual Leave, Sick Leave) and annual ceilings.
        *   **Payload (POST)**:
            ```json
            {
              "name": "Sick Leave",
              "max_days_per_year": 12,
              "is_paid": true
            }
            ```
    *   `GET/POST/DELETE /api/leaves/holidays/` (IsAuthenticated)
        *   **Description**: Registers official public holidays (e.g. Onam, Christmas) which bypass LOP calculations.
        *   **Payload (POST)**:
            ```json
            {
              "name": "Onam",
              "date": "2026-08-28"
            }
            ```
*   **Frontend API Calls Trace**:
    *   Consumed by `[LeaveModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/LeaveModule.jsx)`.

---

### Tasks & Performance
*   **Backend Functionality**: Registers project tasks, allows comments, and triggers notifications on assignment changes.
*   **REST API Endpoints**:
    *   `GET/POST /api/hrms/tasks/` (IsAuthenticated)
    *   `POST /api/hrms/task-comments/` (IsAuthenticated)
*   **Frontend API Calls Trace**:
    *   Consumed by `[TasksModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/TasksModule.jsx)`.

---

## 3. Administrative Modules

### Staff Directory
*   **Backend Functionality**: Manages corporate profiles of staff, mentors, teachers, and coordinators.
*   **REST API Endpoints**:
    *   `GET /api/auth/management/users/` (IsAdminUser)
    *   `POST /api/auth/management/users/` (IsAdminUser)
*   **Frontend API Calls Trace**:
    *   Consumed by `[UsersModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/UsersModule.jsx)`.

---

### Finance Manager
*   **Backend Functionality**: Tracks office operational expenses, processes receipts, and provides breakdowns.
*   **REST API Endpoints**:
    *   `GET/POST/PUT/PATCH/DELETE /api/finance/categories/` (IsAuthenticated)
        *   **Description**: Manages classification categories for office and operational expenses.
        *   **Payload (POST)**:
            ```json
            {
              "name": "Rent & Utilities"
            }
            ```
    *   `GET/POST /api/finance/expenses/` (IsAuthenticated - supports receipt file uploads)
    *   `GET /api/finance/expenses/summary/` (IsAuthenticated)
    *   `GET/POST/PATCH/DELETE /api/transactions/` (IsAuthenticated)
        *   **Description**: Handles transactional invoices and payment receipts mapped to student courses.
        *   **Payload (POST)**:
            ```json
            {
              "student": 4,
              "amount": 5000.00,
              "payment_method": "CASH",
              "transaction_type": "CREDIT",
              "remarks": "Installment 1"
            }
            ```
    *   `GET/POST/PATCH/DELETE /api/documents/` (IsAuthenticated)
        *   **Description**: Manages student identity credentials, certificate PDFs, and registration documentation attachments.
        *   **Payload (POST)**: Supports multipart file upload containing `student` ID, `document_type`, and `file`.
*   **Frontend API Calls Trace**:
    *   Consumed by `[FinanceModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/FinanceModule.jsx)` and nested student profiling views in `[SalesModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/SalesModule.jsx)` / `[MentorModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/MentorModule.jsx)`.

---

### Admin Panel
*   **Backend Functionality**: Manages RBAC permission rules, payment gateway settings, and Wise LMS synchronization.
*   **REST API Endpoints**:
    *   `GET/PATCH /api/auth/management/permissions/` (IsAdminUser)
    *   `GET/POST /api/integrations/settings/` (IsAuthenticated)
        *   **Description**: Handles global credentials configuration settings for Razorpay payments and Wise LMS integrations.
        *   **Payload (POST)**:
            ```json
            {
              "name": "wise",
              "config": {
                "RAZORPAY_KEY_ID": "rzp_live_xxx",
                "RAZORPAY_KEY_SECRET": "yyy"
              },
              "is_active": true
            }
            ```
    *   `POST /api/integrations/razorpay/order/` (IsAuthenticated - generates Razorpay payment order)
    *   `GET /api/integrations/courses/` (IsAuthenticated)
        *   **Description**: Queries the list of courses/classes present on Wise LMS.
    *   `GET /api/integrations/courses/<class_id>/participants/` (IsAuthenticated)
        *   **Description**: Fetches list of active students enrolled in a specific Wise LMS class.
    *   `POST /api/integrations/sync-students/` (IsAuthenticated - pulls students from Wise LMS)
    *   `POST /api/integrations/sync-batch/` (IsAuthenticated - imports classes as batches)
        *   **Payload**: `{"class_id": "123456"}`
    *   `POST /api/integrations/sync-attendance/` (IsAuthenticated - imports Zoom logs and marks student session logs)
    *   `POST /api/integrations/sync-teachers/` (IsAuthenticated)
        *   **Description**: Triggers sync scan to import instructors from Wise LMS and creates local CRM teacher user records.
    *   `POST /api/integrations/auto-link/` (IsAuthenticated)
        *   **Description**: Analyzes local batches against Wise LMS classes and links them by matching subjects/names.
    *   `POST /api/integrations/consume-credits/` (IsAuthenticated)
        *   **Description**: Deducts credits from a student on the Wise LMS platform.
        *   **Payload**: `{"student_id": 4, "class_id": "123", "credit": 1}`
    *   `POST /api/integrations/link-student/` (IsAuthenticated)
        *   **Description**: Manually searches and links a CRM student to Wise LMS by looking up their mobile number.
        *   **Payload**: `{"student_id": 4}`
*   **Frontend API Calls Trace**:
    *   Consumed by `[AdminModule.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/pages/AdminModule.jsx)`.

---

## 4. Notifications Module

### System Alerts & Inbox
*   **Backend Functionality**: Registers real-time system alerts (e.g. task assignments, batch enrollment logs, leave request updates). Offers methods to fetch unread alerts, mark read, or batch-clear messages.
*   **REST API Endpoints**:
    *   `GET /api/notifications/` (IsAuthenticated)
        *   **Description**: Retrieves a chronological list of notifications for the requesting user.
    *   `POST /api/notifications/` (IsAuthenticated)
        *   **Description**: Dispatches a new notification to a specific user.
        *   **Payload**:
            ```json
            {
              "title": "Task Assigned",
              "message": "You have been assigned to verify March attendance.",
              "notification_type": "TASK",
              "target_url": "/tasks"
            }
            ```
    *   `GET /api/notifications/unread_count/` (IsAuthenticated)
        *   **Description**: Returns count of unread notifications for badge rendering.
        *   **Response**: `{"count": 3}`
    *   `POST /api/notifications/<id>/mark_read/` (IsAuthenticated)
        *   **Description**: Marks a specific notification as read.
    *   `POST /api/notifications/mark_all_read/` (IsAuthenticated)
        *   **Description**: Clears all unread notifications for the active user.
*   **Frontend API Calls Trace**:
    *   Consumed by the `[NotificationCenter.jsx](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/frontend/src/components/NotificationCenter.jsx)` navbar component. Features background polling triggered every 30 seconds to fetch fresh alerts.

---

## Developer Quality Insights

### Unregistered MCQ Autograding Viewset
The `StudentSubmissionViewSet` (located in `[core/views.py](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/backend/core/views.py#L546)`) is fully implemented to grade MCQ answers using a JSON comparison algorithm. However, this viewset is **not** registered in `[core/urls.py](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/backend/core/urls.py)`. The frontend `StudentPortal.jsx` currently runs exam taking and confirmation locally on the client. To activate backend submissions:
1. Register `StudentSubmissionViewSet` in `[core/urls.py](file:///c:/Users/91811/OneDrive/Desktop/Natya_May/backend/core/urls.py)` under `student-submissions`.
2. Connect the `Submit Final Test` button in `StudentPortal.jsx` to dispatch a `POST /api/student-submissions/` request containing the compiled answers payload.

---

## Seeding & Bootstrap Command Guide

Run these commands inside the `backend/` directory to seed mock data:
- **Seed RBAC Permissions**: `python seed_permissions.py`
- **Initialize Leave Entitlements**: `python populate_balances.py`
- **Register Kerala Public Holidays**: `python populate_leaves.py`
- **Seed Expense Categories**: `python populate_finance.py`
