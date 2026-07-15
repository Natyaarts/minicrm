from django.contrib.auth import get_user_model
from core.models import Program, SubProgram, Course, Batch, Student
import random
import string
import datetime

User = get_user_model()

data = {
    "G 1 OFFLINE BN": [("Vishna", "8891575292"), ("Neethu", "7736030403"), ("Shyma", "7994490573"), ("Thanirika nair", "9895016010"), ("Nisha M M", "7012152945"), ("Arathi Anoop", "8078124278")],
    "G 8 OFFLINE BNS": [("Vanaja", "7592873960"), ("Dr Aswani baburaj", "7907042015"), ("Meenakshi Abhiram devi", "9645204242"), ("Neha Lara", "9645204242"), ("Anitha Pradeep", "9846424793")],
    "G 01 CMJ OFFLINE": [("Mishaka A", "7907802202"), ("Esha Das", "9747213568"), ("Rajitha Haridas", "9747213568"), ("Nihith Arun", "9745484498")],
    "CMJ OFFLINE G02": [("Effic sheril", "9544520627"), ("Emma sheril", "9544520627")],
    "WINZA OFFLINE CMS": [("Winza", "8590903388")],
    "G 9 OFFLINE BNJ": [("Tanishka nair", "9895016010"), ("Devna s", "6282862057"), ("Annette philip", "9946244550")],
    "G 7 OFFLINE BN": [("Christeena", "8592978715"), ("Shwetha T M", "9207492216"), ("Suchina E K", "9656858168"), ("Greeshma", "7510281923")],
    "G1 OFFLINE KATHAK": [("Sruthi P A", "9447282229")],
    "G2 OFFLINE KATHAK": [("Sruthi Vijayan", "8129381506"), ("Azala Ashkar", "7034525372")],
    "G 10 OFFLINE BNJ": [("Ziva Bashir", "8590903388"), ("Anna Prince", "9846661874"), ("Tanvi binoj", "8301950648")],
    "G03 OFFLINE KATHAK": [("Swapna P K", "8304071623")],
    "G01 NATYAPREVISHKA OFFLINE": [("Namitha Iqbal", "7736333919"), ("Akshara", "7592009785")],
    "G 1 KUCH OFFLINE": [("Indraja K", "9746632396"), ("Shivanya swapna", "8921389437")],
    "INDIAN YOGA MORNING": [("Chandralekha", "9446036262"), ("Veena", "97433548834"), ("Lakshmi", "9645233050"), ("Sandra S Menon", "8921436829"), ("Aswathy V S", "6282923020"), ("Anjana Parakkal", "9901633256"), ("Sivapriya", "8589878227"), ("Anju S Narayanan", "7558811914"), ("Nithu T", "8147565424"), ("Dhyana Devi", "9495674711"), ("Neethu sooraj", "9447194284")]
}

# 1. FIND OR CREATE MENTOR SIVASREE
mentor = User.objects.filter(first_name__icontains='Siva').first()
if not mentor:
    print("Mentor Sivasree A K not found! Creating her account now...")
    mentor = User.objects.create_user(
        username="sivasree",
        password="password123",
        first_name="Sivasree",
        last_name="A K"
    )
    print("Created Sivasree successfully!")
else:
    print(f"Found existing mentor: {mentor.first_name} {mentor.last_name}")

# 2. CREATE 'OFFLINE' PROGRAM CATEGORY
program, _ = Program.objects.get_or_create(name='Offline')
sub_program, _ = SubProgram.objects.get_or_create(name='General', program=program)
course, _ = Course.objects.get_or_create(name='General Course', sub_program=sub_program)

today = datetime.date.today()
added = 0
created = 0

# 3. CREATE BATCHES AND STUDENTS
for batch_name, students in data.items():
    batch, _ = Batch.objects.get_or_create(name=batch_name, course=course, defaults={'start_date': today})
    
    # Assign Mentor to Batch
    if batch.primary_mentor != mentor:
        batch.primary_mentor = mentor
        batch.save()
    
    for name, phone in students:
        clean_phone = "".join(filter(str.isdigit, phone))[-10:] if len("".join(filter(str.isdigit, phone))) >= 10 else phone
        
        student = Student.objects.filter(mobile__icontains=clean_phone).first() if clean_phone else None
        if not student:
            student = Student.objects.filter(first_name__iexact=name).first()
        
        if student:
            student.batch = batch
            student.program_type = program
            student.sub_program = sub_program
            student.course = course
            student.save()
            added += 1
        else:
            uname = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
            u = User.objects.create_user(username=uname, password="password123", first_name=name)
            crm_id = f"STU-{User.objects.count() + 1000}"
            Student.objects.create(user=u, crm_student_id=crm_id, program_type=program, sub_program=sub_program, course=course, batch=batch, first_name=name, mobile=phone)
            created += 1

print(f"\n--- SUCCESS ---")
print(f"Existing Students Found & Assigned: {added}")
print(f"New Students Created & Assigned: {created}")
print(f"All 14 Batches assigned to Sivasree A K.")
