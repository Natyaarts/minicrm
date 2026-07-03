import os
import sys
import django
from datetime import datetime

# Setup Django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from hrms.models import Department, Designation, EmployeeProfile
from django.contrib.auth import get_user_model
from payroll.models import SalaryStructure

User = get_user_model()

def get_dept(name):
    d, _ = Department.objects.get_or_create(name=name)
    return d

def get_desig(name, dept_name):
    if not name or not dept_name: return None
    d = get_dept(dept_name)
    desig, _ = Designation.objects.get_or_create(name=name, department=d)
    return desig


    {'emp_id': 'EMP-NA-001', 'full_name': 'Anjana K S', 'email': '', 'phone': '8281106504', 'dept_name': 'Sales', 'desig_name': 'Head - Sales', 'doj_str': '2022-11-01', 'dob_str': '1997-03-17', 'salary': 24000, 'status': 'INACTIVE', 'username': 'gen_empna001', 'first_name': 'Anjana', 'last_name': 'K S'},
    {'emp_id': 'EMP-NA-002', 'full_name': 'Krishna Priya', 'email': '', 'phone': '', 'dept_name': 'Academics', 'desig_name': 'Academic Expert', 'doj_str': '2024-04-24', 'dob_str': '2000-07-04', 'salary': 22000, 'status': 'INACTIVE', 'username': 'gen_empna002', 'first_name': 'Krishna', 'last_name': 'Priya'},
    {'emp_id': 'EMP-NA-003', 'full_name': 'Midhula Krishna', 'email': 'meenumidhula2000@gmail.com', 'phone': '9446679960', 'dept_name': 'Academics', 'desig_name': 'Resource&Dvlpmt', 'doj_str': '2024-06-24', 'dob_str': '2000-10-21', 'salary': 27000, 'status': 'INACTIVE', 'username': 'gen_empna003', 'first_name': 'Midhula', 'last_name': 'Krishna'},
    {'emp_id': 'EMP-NA-004', 'full_name': 'Priyanka K S', 'email': 'priyapriyankaks@gmail.com', 'phone': '8921813370', 'dept_name': 'Academics', 'desig_name': 'Head - Academics', 'doj_str': '2024-06-28', 'dob_str': '1994-12-09', 'salary': 33000, 'status': 'INACTIVE', 'username': 'gen_empna004', 'first_name': 'Priyanka', 'last_name': 'K S'},
    {'emp_id': 'EMP-NA-005', 'full_name': 'Sreelakshmi P R', 'email': 'sreelakshmipr335@gmail.com', 'phone': '7510583501', 'dept_name': 'Academics', 'desig_name': 'Mentor', 'doj_str': '2024-08-14', 'dob_str': '1999-01-22', 'salary': 15000, 'status': 'INACTIVE', 'username': 'SREELAKSHMI', 'first_name': 'Sreelakshmi', 'last_name': 'P R'},
    {'emp_id': 'EMP-NA-006', 'full_name': 'Sreepriya K S', 'email': '25sreepriya25@gmail.com', 'phone': '7025662954', 'dept_name': 'Academics', 'desig_name': 'Mentor', 'doj_str': '2024-09-26', 'dob_str': '2000-09-25', 'salary': 15000, 'status': 'INACTIVE', 'username': 'gen_empna006', 'first_name': 'Sreepriya', 'last_name': 'K S'},
    {'emp_id': 'EMP-NA-007', 'full_name': 'Sandeep P T', 'email': 'aandeeppt50@gmail.com', 'phone': '9645051668', 'dept_name': 'SMM', 'desig_name': 'Content Writer', 'doj_str': '2024-09-30', 'dob_str': '1999-10-22', 'salary': 18000, 'status': 'INACTIVE', 'username': 'gen_empna007', 'first_name': 'Sandeep', 'last_name': 'P T'},
    {'emp_id': 'EMP-NA-008', 'full_name': 'Silpa E K', 'email': 'silpaek98@gmail.com', 'phone': '9656037607', 'dept_name': 'Academics', 'desig_name': 'Academic Mentor', 'doj_str': '2024-10-07', 'dob_str': '1998-11-24', 'salary': 15000, 'status': 'INACTIVE', 'username': 'gen_empna008', 'first_name': 'Silpa', 'last_name': 'E K'},
    {'emp_id': 'EMP-NA-009', 'full_name': 'Adwaid T M', 'email': 'adwaithpanchajanyam@gmail.com', 'phone': '8129679718', 'dept_name': 'SMM', 'desig_name': 'Graphic Designer', 'doj_str': '2024-10-21', 'dob_str': '2003-03-22', 'salary': 15000, 'status': 'INACTIVE', 'username': 'gen_empna009', 'first_name': 'Adwaid', 'last_name': 'T M'},
    {'emp_id': 'EMP-NA-010', 'full_name': 'Sniya K', 'email': 'sniyakottayiskn@gmail.com', 'phone': '9846772163', 'dept_name': 'Academics', 'desig_name': 'Head - Mentor', 'doj_str': '2024-11-13', 'dob_str': '2001-01-14', 'salary': 20000, 'status': 'INACTIVE', 'username': 'gen_empna010', 'first_name': 'Sniya', 'last_name': 'K'},
    {'emp_id': 'EMP-NA-011', 'full_name': 'Megha Mohanan V', 'email': 'meghamohananv09@gmail.com', 'phone': '8547812874', 'dept_name': 'HR&Administration', 'desig_name': 'HR Executive', 'doj_str': '2024-11-18', 'dob_str': '2001-09-02', 'salary': 18000, 'status': 'INACTIVE', 'username': 'gen_empna011', 'first_name': 'Megha', 'last_name': 'Mohanan V'},
    {'emp_id': 'EMP-NA-012', 'full_name': 'Vaishnavi Viswanath V V', 'email': 'vaishnaviviswanath1@gmail.com', 'phone': '8547536938', 'dept_name': 'Academics', 'desig_name': 'Academic Expert', 'doj_str': '2024-12-17', 'dob_str': '2000-08-21', 'salary': 22000, 'status': 'INACTIVE', 'username': 'gen_empna012', 'first_name': 'Vaishnavi', 'last_name': 'Viswanath V V'},
    {'emp_id': 'EMP-NA-013', 'full_name': 'Abhiram Krishna G K', 'email': 'abhiram8117@gmail.com', 'phone': '7902494365', 'dept_name': 'Administration', 'desig_name': 'Admin Asst', 'doj_str': '2025-01-14', 'dob_str': '2003-02-16', 'salary': 13000, 'status': 'INACTIVE', 'username': 'gen_empna013', 'first_name': 'Abhiram', 'last_name': 'Krishna G K'},
    {'emp_id': 'EMP-NA-014', 'full_name': 'Anusree K M', 'email': 'anusreekm08@gmail.com', 'phone': '8592906986', 'dept_name': 'SMM', 'desig_name': 'Digital Marketing Executive', 'doj_str': '2025-04-03', 'dob_str': '2001-08-22', 'salary': 17000, 'status': 'INACTIVE', 'username': 'Anusree', 'first_name': 'Anusree', 'last_name': 'K M'},
    {'emp_id': 'EMP-NA-015', 'full_name': 'Anagha P', 'email': 'panaghababuraj@gmail.com', 'phone': '9037723688', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-04-10', 'dob_str': '2000-02-19', 'salary': 12000, 'status': 'INACTIVE', 'username': 'gen_empna015', 'first_name': 'Anagha', 'last_name': 'P'},
    {'emp_id': 'EMP-NA-016', 'full_name': 'Anupama S', 'email': '', 'phone': '8289831724', 'dept_name': 'Academics', 'desig_name': 'Mentor', 'doj_str': '2025-04-09', 'dob_str': '1997-05-28', 'salary': 15000, 'status': 'INACTIVE', 'username': 'ANUPAMA', 'first_name': 'Anupama', 'last_name': 'S'},
    {'emp_id': 'EMP-NA-017', 'full_name': 'Sarath K', 'email': 'sarathkalappara7474@gmail.com', 'phone': '8281606240', 'dept_name': 'SMM', 'desig_name': 'Digital Marketing Executive', 'doj_str': '2025-04-21', 'dob_str': '2002-11-29', 'salary': 15000, 'status': 'INACTIVE', 'username': 'gen_empna017', 'first_name': 'Sarath', 'last_name': 'K'},
    {'emp_id': 'EMP-NA-018', 'full_name': 'Sivasree A K', 'email': 'sivasreeak@gmail.com', 'phone': '7902746776', 'dept_name': 'Administration', 'desig_name': 'Front office', 'doj_str': '2025-04-30', 'dob_str': '2002-06-13', 'salary': 12000, 'status': 'ACTIVE', 'username': 'Sivasree', 'first_name': 'Sivasree', 'last_name': 'A K'},
    {'emp_id': 'EMP-NA-019', 'full_name': 'Vismaya A', 'email': 'subithaanil69@gmail.com', 'phone': '8891033551', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-05-06', 'dob_str': '2004-04-13', 'salary': 11000, 'status': 'INACTIVE', 'username': 'gen_empna019', 'first_name': 'Vismaya', 'last_name': 'A'},
    {'emp_id': 'EMP-NA-020', 'full_name': 'Muhammed Yasin M C', 'email': 'mcyaseenahammed@gmail.com', 'phone': '8089454574', 'dept_name': 'Sales', 'desig_name': 'BDE-WFH', 'doj_str': '2025-05-17', 'dob_str': '1999-03-11', 'salary': 10000, 'status': 'INACTIVE', 'username': 'gen_empna020', 'first_name': 'Muhammed', 'last_name': 'Yasin M C'},
    {'emp_id': 'EMP-NA-021', 'full_name': 'Adhin Prakash P B', 'email': 'adhin2425@gmail.com', 'phone': '9497618782', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-04-07', 'dob_str': '2003-03-23', 'salary': 9000, 'status': 'INACTIVE', 'username': 'gen_empna021', 'first_name': 'Adhin', 'last_name': 'Prakash P B'},
    {'emp_id': 'EMP-NA-022', 'full_name': 'Aagna M', 'email': 'aagnamahesh17@gmail.com', 'phone': '9633548561', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-05-12', 'dob_str': '2003-10-15', 'salary': 10000, 'status': 'INACTIVE', 'username': 'gen_empna022', 'first_name': 'Aagna', 'last_name': 'M'},
    {'emp_id': 'EMP-NA-023', 'full_name': 'Ann Nirmala', 'email': 'annnirmala19@gmail.com', 'phone': '8590805494', 'dept_name': 'Academics', 'desig_name': 'Academic Coordinator', 'doj_str': '2025-05-21', 'dob_str': '2001-06-08', 'salary': 22000, 'status': 'INACTIVE', 'username': 'gen_empna023', 'first_name': 'Ann', 'last_name': 'Nirmala'},
    {'emp_id': 'EMP-NA-024', 'full_name': 'Subhash C V', 'email': 'subhashcvwyd@gmail.com', 'phone': '9048167213', 'dept_name': 'Finance', 'desig_name': 'Manager - Accounts', 'doj_str': '2025-05-25', 'dob_str': '1984-01-11', 'salary': 27000, 'status': 'INACTIVE', 'username': 'gen_empna024', 'first_name': 'Subhash', 'last_name': 'C V'},
    {'emp_id': 'EMP-NA-025', 'full_name': 'Anjana N M', 'email': 'anjanalineesh508@gmail.com', 'phone': '7306684821', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-05-29', 'dob_str': '2006-05-14', 'salary': 10000, 'status': 'INACTIVE', 'username': 'gen_empna025', 'first_name': 'Anjana', 'last_name': 'N M'},
    {'emp_id': 'EMP-NA-026', 'full_name': 'Vijay P N', 'email': 'pnvijay90@gmail.com', 'phone': '8113900760', 'dept_name': 'IT', 'desig_name': 'App Coordinator', 'doj_str': '2025-06-02', 'dob_str': '2002-06-10', 'salary': 35000, 'status': 'ACTIVE', 'username': 'gen_empna026', 'first_name': 'Vijay', 'last_name': 'P N'},
    {'emp_id': 'EMP-NA-027', 'full_name': 'Shilpa K S', 'email': 'ksshilpasiva003@gmail.com', 'phone': '9037929503', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-06-12', 'dob_str': '2003-03-31', 'salary': 11000, 'status': 'INACTIVE', 'username': 'wise_t_69a2b5a713cc1073aff77e7a', 'first_name': 'Shilpa', 'last_name': 'K S'},
    {'emp_id': 'EMP-NA-028', 'full_name': 'Vishnupriya Sajeevan', 'email': 'vishnupriyasajeevan2001@gmail.com', 'phone': '9961852850', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-06-13', 'dob_str': '2001-07-23', 'salary': 13000, 'status': 'INACTIVE', 'username': 'gen_empna028', 'first_name': 'Vishnupriya', 'last_name': 'Sajeevan'},
    {'emp_id': 'EMP-NA-029', 'full_name': 'Anupama T K', 'email': 'anupamarajesh702@gmail.com', 'phone': '7561852011', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-06-13', 'dob_str': '1988-04-14', 'salary': 11000, 'status': 'INACTIVE', 'username': 'ANUPAMA', 'first_name': 'Anupama', 'last_name': 'T K'},
    {'emp_id': 'EMP-NA-030', 'full_name': 'Anaswara K P', 'email': 'anu999163@gmail.com', 'phone': '7994322088', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-06-14', 'dob_str': '1996-04-08', 'salary': 13000, 'status': 'INACTIVE', 'username': 'ANASWARA', 'first_name': 'Anaswara', 'last_name': 'K P'},
    {'emp_id': 'EMP-NA-031', 'full_name': 'Sreenath G', 'email': '', 'phone': '9746343983', 'dept_name': 'Academics', 'desig_name': 'Academic Expert', 'doj_str': '2025-06-16', 'dob_str': '2000-03-12', 'salary': 21000, 'status': 'INACTIVE', 'username': 'gen_empna031', 'first_name': 'Sreenath', 'last_name': 'G'},
    {'emp_id': 'EMP-NA-032', 'full_name': 'Athira K T', 'email': 'athirakt0512@gmail.com', 'phone': '9656933148', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-06-23', 'dob_str': '1995-12-05', 'salary': 12000, 'status': 'ACTIVE', 'username': 'ATHIRAJAYAKUMAR', 'first_name': 'Athira', 'last_name': 'K T'},
    {'emp_id': 'EMP-NA-033', 'full_name': 'Anjana R S', 'email': 'anjanars707@gmail.com', 'phone': '8139040724', 'dept_name': 'HR&Administration', 'desig_name': 'Manager - HR', 'doj_str': '2025-06-23', 'dob_str': '1997-10-18', 'salary': 26000, 'status': 'INACTIVE', 'username': 'gen_empna033', 'first_name': 'Anjana', 'last_name': 'R S'},
    {'emp_id': 'EMP-NA-034', 'full_name': 'Arundhathi Raj O P', 'email': 'arundhathiraj39@gmail.com', 'phone': '6238319257', 'dept_name': 'Academics', 'desig_name': 'Academic Coordinator', 'doj_str': '2025-07-14', 'dob_str': '2000-03-19', 'salary': 18000, 'status': 'INACTIVE', 'username': 'gen_empna034', 'first_name': 'Arundhathi', 'last_name': 'Raj O P'},
    {'emp_id': 'EMP-NA-035', 'full_name': 'Agnas Sebastian', 'email': 'agnassebastian2001@gmail.com', 'phone': '9656022392', 'dept_name': 'Academics', 'desig_name': 'Academic Mentor', 'doj_str': '2025-07-14', 'dob_str': '2001-07-14', 'salary': 16000, 'status': 'ACTIVE', 'username': 'gen_empna035', 'first_name': 'Agnas', 'last_name': 'Sebastian'},
    {'emp_id': 'EMP-NA-036', 'full_name': 'Muhammed Nihal K T', 'email': 'nihalkt87@gmail.com', 'phone': '8129577887', 'dept_name': 'Finance&Accounts', 'desig_name': 'Accounts Executive', 'doj_str': '2025-07-14', 'dob_str': '2002-11-20', 'salary': 12000, 'status': 'ACTIVE', 'username': 'gen_empna036', 'first_name': 'Muhammed', 'last_name': 'Nihal K T'},
    {'emp_id': 'EMP-NA-037', 'full_name': 'Anusree N V', 'email': 'anus7379@gmail.com', 'phone': '9778544152', 'dept_name': 'Academics', 'desig_name': 'Academic Mentor', 'doj_str': '2025-07-16', 'dob_str': '1999-06-09', 'salary': 16000, 'status': 'ACTIVE', 'username': 'Anusree', 'first_name': 'Anusree', 'last_name': 'N V'},
    {'emp_id': 'EMP-NA-038', 'full_name': 'Dhanya M', 'email': 'dhanyareneesh19@gmail.com', 'phone': '9544439113', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-08-01', 'dob_str': '1992-10-19', 'salary': 15000, 'status': 'INACTIVE', 'username': 'gen_empna038', 'first_name': 'Dhanya', 'last_name': 'M'},
    {'emp_id': 'EMP-NA-039', 'full_name': 'Adithya V', 'email': 'adithyadevadas2255@gmail.com', 'phone': '8848748263', 'dept_name': 'HR & Administration', 'desig_name': 'HR Executive', 'doj_str': '2025-08-05', 'dob_str': '2002-01-11', 'salary': 13000, 'status': 'ACTIVE', 'username': 'gen_empna039', 'first_name': 'Adithya', 'last_name': 'V'},
    {'emp_id': 'EMP-NA-040', 'full_name': 'Surya A', 'email': 'suryasubramanian8089@gmail.com', 'phone': '9207117107', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-08-11', 'dob_str': '1992-05-30', 'salary': 17000, 'status': 'INACTIVE', 'username': 'gen_empna040', 'first_name': 'Surya', 'last_name': 'A'},
    {'emp_id': 'EMP-NA-041', 'full_name': 'Subisha E M', 'email': 'subisharajeeshkk@gmail.com', 'phone': '8891511553', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-08-11', 'dob_str': '1990-01-25', 'salary': 17000, 'status': 'INACTIVE', 'username': 'gen_empna041', 'first_name': 'Subisha', 'last_name': 'E M'},
    {'emp_id': 'EMP-NA-042', 'full_name': 'Adarsh K', 'email': 'adarshkadarshk984@gmail.com', 'phone': '9633697102', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-08-20', 'dob_str': '2003-06-06', 'salary': 15000, 'status': 'INACTIVE', 'username': 'gen_empna042', 'first_name': 'Adarsh', 'last_name': 'K'},
    {'emp_id': 'EMP-NA-043', 'full_name': 'Raji K C', 'email': 'rajikc82@gmail.com', 'phone': '9496308687', 'dept_name': 'Sales', 'desig_name': 'Head - Sales', 'doj_str': '2025-08-16', 'dob_str': '1982-05-30', 'salary': 24000, 'status': 'ACTIVE', 'username': 'Raji', 'first_name': 'Raji', 'last_name': 'K C'},
    {'emp_id': 'EMP-NA-044', 'full_name': 'Linu A V', 'email': 'linujiji039@gmail.com', 'phone': '8086197957', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-08-20', 'dob_str': '1997-08-07', 'salary': 15000, 'status': 'ACTIVE', 'username': 'Linu', 'first_name': 'Linu', 'last_name': 'A V'},
    {'emp_id': 'EMP-NA-045', 'full_name': 'Deepa M', 'email': 'deepamahendren802@gmail.com', 'phone': '6235147271', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-08-11', 'dob_str': '2006-09-26', 'salary': 10000, 'status': 'INACTIVE', 'username': 'gen_empna045', 'first_name': 'Deepa', 'last_name': 'M'},
    {'emp_id': 'EMP-NA-046', 'full_name': 'Sreenandhana K K', 'email': 'sreenandhanakk2024@gmail.com', 'phone': '8086649587', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-08-11', 'dob_str': '2003-11-06', 'salary': 10000, 'status': 'INACTIVE', 'username': 'gen_empna046', 'first_name': 'Sreenandhana', 'last_name': 'K K'},
    {'emp_id': 'EMP-NA-047', 'full_name': 'Aiswarya P T', 'email': 'zapsaiswarya@gmail.com', 'phone': '7034807356', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-08-20', 'dob_str': '1998-09-26', 'salary': 12000, 'status': 'INACTIVE', 'username': 'wise_t_69da1a5098ee51775f20d8bb', 'first_name': 'Aiswarya', 'last_name': 'P T'},
    {'emp_id': 'EMP-NA-048', 'full_name': 'Fathima K M', 'email': 'fatemaahbasheer@gmail.com', 'phone': '8089659055', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-08-20', 'dob_str': '2005-11-26', 'salary': 12000, 'status': 'INACTIVE', 'username': 'gen_empna048', 'first_name': 'Fathima', 'last_name': 'K M'},
    {'emp_id': 'EMP-NA-049', 'full_name': 'Aryananda R P', 'email': 'aryanandarp@gmail.com', 'phone': '9605423907', 'dept_name': 'Academics', 'desig_name': 'Academic Expert - Music', 'doj_str': '2025-09-08', 'dob_str': '2001-10-05', 'salary': 23000, 'status': 'ACTIVE', 'username': 'Aryananda', 'first_name': 'Aryananda', 'last_name': 'R P'},
    {'emp_id': 'EMP-NA-050', 'full_name': 'Fathimathul Sinooriya P M', 'email': 'riyasinu8590@gmail.com', 'phone': '8590203865', 'dept_name': 'Sales & Marketing', 'desig_name': 'Digital Marketing Executive', 'doj_str': '2025-09-08', 'dob_str': '1992-10-02', 'salary': 16000, 'status': 'ACTIVE', 'username': 'gen_empna050', 'first_name': 'Fathimathul', 'last_name': 'Sinooriya P M'},
    {'emp_id': 'EMP-NA-051', 'full_name': 'Harsha Surendran', 'email': 'surendranharsha@gmail.com', 'phone': '7593907686', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-09-15', 'dob_str': '1996-04-04', 'salary': 17000, 'status': 'INACTIVE', 'username': 'gen_empna051', 'first_name': 'Harsha', 'last_name': 'Surendran'},
    {'emp_id': 'EMP-NA-052', 'full_name': 'Syam C', 'email': 'syamc2000@gmail.com', 'phone': '9447218260', 'dept_name': 'Creative', 'desig_name': 'Videographer cum Video Editor', 'doj_str': '2025-09-15', 'dob_str': '2000-02-10', 'salary': 20000, 'status': 'ACTIVE', 'username': 'gen_empna052', 'first_name': 'Syam', 'last_name': 'C'},
    {'emp_id': 'EMP-NA-053', 'full_name': 'Jidhin Krishna P P', 'email': 'jidhinkrishna97@gmail.com', 'phone': '9745306222', 'dept_name': 'Digital Marketing', 'desig_name': 'Performance Marketer', 'doj_str': '2025-09-24', 'dob_str': '1996-01-21', 'salary': 21000, 'status': 'INACTIVE', 'username': 'gen_empna053', 'first_name': 'Jidhin', 'last_name': 'Krishna P P'},
    {'emp_id': 'EMP-NA-054', 'full_name': 'Rinshad P M', 'email': 'kdlrinshad@gmail.com', 'phone': '9539136325', 'dept_name': 'Creative', 'desig_name': 'Graphic Designer', 'doj_str': '2025-10-06', 'dob_str': '2003-07-10', 'salary': 15000, 'status': 'INACTIVE', 'username': 'gen_empna054', 'first_name': 'Rinshad', 'last_name': 'P M'},
    {'emp_id': 'EMP-NA-055', 'full_name': 'Archana Sidharthan', 'email': 'archanasa1904@gmail.com', 'phone': '8113821605', 'dept_name': 'Academics', 'desig_name': 'Academic Expert - Dance', 'doj_str': '2025-10-17', 'dob_str': '2001-04-19', 'salary': 27000, 'status': 'ACTIVE', 'username': 'Archana', 'first_name': 'Archana', 'last_name': 'Sidharthan'},
    {'emp_id': 'EMP-NA-056', 'full_name': 'Sanidhya Sharlin', 'email': 'sanidhyasharlin@gmail.com', 'phone': '9544273327', 'dept_name': 'IT', 'desig_name': 'Full Stack Developer', 'doj_str': '2025-10-27', 'dob_str': '2003-04-05', 'salary': 15000, 'status': 'ACTIVE', 'username': 'wise_t_6888ab760933d0d61998527f', 'first_name': 'Sanidhya', 'last_name': 'Sharlin'},
    {'emp_id': 'EMP-NA-057', 'full_name': 'Lalkrishna V R', 'email': 'lalanlalu103@gmail.com', 'phone': '7094834078', 'dept_name': 'Administration', 'desig_name': 'Admin Executive', 'doj_str': '2025-10-29', 'dob_str': '2000-01-12', 'salary': 13000, 'status': 'ACTIVE', 'username': 'gen_empna057', 'first_name': 'Lalkrishna', 'last_name': 'V R'},
    {'emp_id': 'EMP-NA-058', 'full_name': 'Sudarshana N D', 'email': 'sudarshanads3@gmail.com', 'phone': '9895346295', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-11-03', 'dob_str': '2001-03-10', 'salary': 12000, 'status': 'INACTIVE', 'username': 'gen_empna058', 'first_name': 'Sudarshana', 'last_name': 'N D'},
    {'emp_id': 'EMP-NA-059', 'full_name': 'Anand K', 'email': 'anand.k0096@gmail.com', 'phone': '8086519206', 'dept_name': 'Academics', 'desig_name': 'Academic Coordinator', 'doj_str': '2025-11-05', 'dob_str': '1996-01-09', 'salary': 23000, 'status': 'ACTIVE', 'username': 'Anand', 'first_name': 'Anand', 'last_name': 'K'},
    {'emp_id': 'EMP-NA-060', 'full_name': 'Anjali Bineesh', 'email': 'anjalibineesh987@gmail.com', 'phone': '7736997607', 'dept_name': 'Academics', 'desig_name': 'Academic Mentor', 'doj_str': '2025-12-03', 'dob_str': '2002-09-10', 'salary': 15000, 'status': 'ACTIVE', 'username': 'wise_t_69969c1624f94ab33fd7b002', 'first_name': 'Anjali', 'last_name': 'Bineesh'},
    {'emp_id': 'EMP-NA-061', 'full_name': 'Reshma I K', 'email': 'reshmaik19995@gmail.com', 'phone': '8157074252', 'dept_name': 'Academics', 'desig_name': 'Academic Mentor', 'doj_str': '2025-12-03', 'dob_str': '1995-05-25', 'salary': 15000, 'status': 'ACTIVE', 'username': 'gen_empna061', 'first_name': 'Reshma', 'last_name': 'I K'},
    {'emp_id': 'EMP-NA-062', 'full_name': 'Vyshakh A C', 'email': 'vyshakhckizhur@gmail.com', 'phone': '9061315076', 'dept_name': 'Academics', 'desig_name': 'Academic Mentor', 'doj_str': '2025-12-03', 'dob_str': '2001-01-18', 'salary': 16000, 'status': 'INACTIVE', 'username': 'gen_empna062', 'first_name': 'Vyshakh', 'last_name': 'A C'},
    {'emp_id': 'EMP-NA-063', 'full_name': 'Priyanka M N', 'email': 'pmn79847@gmail.com', 'phone': '8943299677', 'dept_name': 'Academics', 'desig_name': 'Academic Mentor', 'doj_str': '2025-12-03', 'dob_str': '1993-03-12', 'salary': 15000, 'status': 'ACTIVE', 'username': 'gen_empna063', 'first_name': 'Priyanka', 'last_name': 'M N'},
    {'emp_id': 'EMP-NA-064', 'full_name': 'Vishnupriya V', 'email': 'vishnupriyaviju@gmail.com', 'phone': '8089108106', 'dept_name': 'Academics', 'desig_name': 'Dance Faculty', 'doj_str': '2025-12-05', 'dob_str': '2002-02-13', 'salary': 25000, 'status': 'ACTIVE', 'username': 'gen_empna064', 'first_name': 'Vishnupriya', 'last_name': 'V'},
    {'emp_id': 'EMP-NA-065', 'full_name': 'Nisha P', 'email': '', 'phone': '8891145647', 'dept_name': 'nan', 'desig_name': 'House Keeping', 'doj_str': '2025-12-15', 'dob_str': '1970-05-04', 'salary': 12000, 'status': 'ACTIVE', 'username': 'gen_empna065', 'first_name': 'Nisha', 'last_name': 'P'},
    {'emp_id': 'EMP-NA-066', 'full_name': 'Lakshmi M R', 'email': 'lakshmi142008@gmail.com', 'phone': '9633070698', 'dept_name': 'Academics', 'desig_name': 'Academic Mentor', 'doj_str': '2025-12-18', 'dob_str': '2002-01-11', 'salary': 16000, 'status': 'INACTIVE', 'username': 'gen_empna066', 'first_name': 'Lakshmi', 'last_name': 'M R'},
    {'emp_id': 'EMP-NA-067', 'full_name': 'Jinisha A P', 'email': 'jinishajinimol@gmail.com', 'phone': '8075792971', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2025-12-06', 'dob_str': '2002-05-26', 'salary': 14000, 'status': 'ACTIVE', 'username': 'Jinisha', 'first_name': 'Jinisha', 'last_name': 'A P'},
    {'emp_id': 'EMP-NA-068', 'full_name': 'Shilpa Suresh', 'email': 'shilpasuresh9778@gmail.com', 'phone': '', 'dept_name': 'Academics', 'desig_name': 'Academic Mentor', 'doj_str': '2025-12-08', 'dob_str': '1997-09-06', 'salary': 15000, 'status': 'INACTIVE', 'username': 'wise_t_69a2b5a713cc1073aff77e7a', 'first_name': 'Shilpa', 'last_name': 'Suresh'},
    {'emp_id': 'EMP-NA-069', 'full_name': 'Athulya M M', 'email': 'athulya8986@gmail.com', 'phone': '7736228986', 'dept_name': 'Academics', 'desig_name': 'Academic Mentor', 'doj_str': '2026-01-07', 'dob_str': '2003-03-09', 'salary': 15000, 'status': 'ACTIVE', 'username': 'gen_empna069', 'first_name': 'Athulya', 'last_name': 'M M'},
    {'emp_id': 'EMP-NA-070', 'full_name': 'Arsha Das M K', 'email': 'arshaharidas123@gmail.com', 'phone': '7510516138', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2026-01-15', 'dob_str': '2002-06-18', 'salary': 14000, 'status': 'INACTIVE', 'username': 'gen_empna070', 'first_name': 'Arsha', 'last_name': 'Das M K'},
    {'emp_id': 'EMP-NA-071', 'full_name': 'Sameer C', 'email': 'sameercsr1@gmail.com', 'phone': '9605484817', 'dept_name': 'Operations', 'desig_name': 'Operations Manager', 'doj_str': '2026-01-19', 'dob_str': '1994-03-13', 'salary': 50000, 'status': 'ACTIVE', 'username': 'gen_empna071', 'first_name': 'Sameer', 'last_name': 'C'},
    {'emp_id': 'EMP-NA-072', 'full_name': 'Adithyalakshmi Shaji', 'email': 'adithyalakshmi17@gmail.com', 'phone': '8848292242', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2026-01-27', 'dob_str': '2004-02-06', 'salary': 14000, 'status': 'INACTIVE', 'username': 'gen_empna072', 'first_name': 'Adithyalakshmi', 'last_name': 'Shaji'},
    {'emp_id': 'EMP-NA-073', 'full_name': 'Shilpa Ashok', 'email': 'shilpaashok348@gmail.com', 'phone': '8590104709', 'dept_name': 'Academics', 'desig_name': 'Academic Head', 'doj_str': '2026-02-05', 'dob_str': '1996-10-10', 'salary': 33000, 'status': 'ACTIVE', 'username': 'wise_t_69a2b5a713cc1073aff77e7a', 'first_name': 'Shilpa', 'last_name': 'Ashok'},
    {'emp_id': 'EMP-NA-074', 'full_name': 'Sreelakshmi P', 'email': 'psreelakshmi263@gmail.com', 'phone': '9947752388', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2026-02-16', 'dob_str': '2002-08-16', 'salary': 14000, 'status': 'INACTIVE', 'username': 'SREELAKSHMI', 'first_name': 'Sreelakshmi', 'last_name': 'P'},
    {'emp_id': 'EMP-NA-075', 'full_name': 'Arathi P', 'email': 'arathiiinair@gmail.com', 'phone': '7034590279', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2026-03-03', 'dob_str': '1999-06-09', 'salary': 14000, 'status': 'ACTIVE', 'username': 'Arathi', 'first_name': 'Arathi', 'last_name': 'P'},
    {'emp_id': 'EMP-NA-076', 'full_name': 'Anamika K', 'email': 'anamikarajeev221@gmail.com', 'phone': '8590557427', 'dept_name': 'Sales', 'desig_name': 'Sales - Team Lead', 'doj_str': '2026-03-16', 'dob_str': '2002-08-14', 'salary': 25000, 'status': 'INACTIVE', 'username': 'gen_empna076', 'first_name': 'Anamika', 'last_name': 'K'},
    {'emp_id': 'EMP-NA-077', 'full_name': 'Adithyan Babu', 'email': 'adithyanbabu707@gmail.com', 'phone': '9072846225', 'dept_name': 'Creative', 'desig_name': 'Graphic Designer', 'doj_str': '2026-03-23', 'dob_str': '2001-04-01', 'salary': 15000, 'status': 'ACTIVE', 'username': 'Adithyan', 'first_name': 'Adithyan', 'last_name': 'Babu'},
    {'emp_id': 'EMP-NA-078', 'full_name': 'Ayisha Maha', 'email': 'ayshamaha2001@gmail.com', 'phone': '9496130942', 'dept_name': 'Sales', 'desig_name': 'Sales - Team Lead', 'doj_str': '2026-05-04', 'dob_str': '2001-01-22', 'salary': 25000, 'status': 'INACTIVE', 'username': 'gen_empna078', 'first_name': 'Ayisha', 'last_name': 'Maha'},
    {'emp_id': 'EMP-NA-079', 'full_name': 'Reshmi K P', 'email': 'reshmilachuoo@gmail.com', 'phone': '9072773022', 'dept_name': 'Sales', 'desig_name': 'BDE', 'doj_str': '2026-05-15', 'dob_str': '2000-01-01', 'salary': 16000, 'status': 'ACTIVE', 'username': 'Reshmi', 'first_name': 'Reshmi', 'last_name': 'K P'},
    {'emp_id': 'EMP-NA-080', 'full_name': 'Arjun Thayyil', 'email': 'thayyilarjun1@gmail.com', 'phone': '8848528683', 'dept_name': 'Operations', 'desig_name': 'Branch Manager', 'doj_str': '2026-06-08', 'dob_str': '1994-07-13', 'salary': 35000, 'status': 'ACTIVE', 'username': 'gen_empna080', 'first_name': 'Arjun', 'last_name': 'Thayyil'},
    {'emp_id': 'EMP-NA-081', 'full_name': 'Sayed Safvan', 'email': 'safwanmax@gmail.com', 'phone': '9746796191', 'dept_name': 'Sales', 'desig_name': 'Sales - Team Lead', 'doj_str': '2026-06-29', 'dob_str': '1993-11-04', 'salary': 25000, 'status': 'ACTIVE', 'username': 'gen_empna081', 'first_name': 'Sayed', 'last_name': 'Safvan'},
]

for d in DATA:
    try:
        user = User.objects.filter(username=d['username']).first()
        if not user:
            user = User.objects.create_user(
                username=d['username'],
                email=d['email'],
                first_name=d['first_name'],
                last_name=d['last_name'],
                password="Password@123",
                role="EMPLOYEE"
            )
            print(f"Created new user {d['username']}")
        else:
            if d['email'] and not user.email:
                user.email = d['email']
            if d['phone'] and not user.phone_number:
                user.phone_number = d['phone']
            user.save()
            print(f"Matched user {d['username']}")

        dept = get_dept(d['dept_name']) if d['dept_name'] and d['dept_name'] != 'nan' else None
        desig = get_desig(d['desig_name'], d['dept_name']) if d['desig_name'] and d['desig_name'] != 'nan' else None
        
        profile, created = EmployeeProfile.objects.get_or_create(
            user=user, 
            defaults={'employee_id': d['emp_id'], 'date_of_joining': d['doj_str'] or datetime.now().date()}
        )
        
        profile.employee_id = d['emp_id']
        profile.department = dept
        profile.designation = desig
        if d['dob_str']: profile.date_of_birth = d['dob_str']
        if d['doj_str']: profile.date_of_joining = d['doj_str']
        
        profile.base_salary = d['salary']
        profile.status = "RESIGNED" if d['status'] == "INACTIVE" else "ACTIVE"
        profile.save()
        
        sal_struct, _ = SalaryStructure.objects.get_or_create(employee=profile)
        sal_struct.base_salary = profile.base_salary
        sal_struct.save()
        
    except Exception as e:
        print(f"Error processing {d['emp_id']}: {e}")
