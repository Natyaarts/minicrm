import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Student, normalize_phone_number
from django.contrib.auth import get_user_model
from django.db import transaction as django_db_transaction

User = get_user_model()

tsv_data = """id	created_time	ad_id	ad_name	adset_id	adset_name	campaign_id	campaign_name	form_id	form_name	is_organic	platform	which_subject_are_you_looking_to_learn?	full_name	phone_number	email	education_level
l:1054074580944020	2026-08-31T11:18:23+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	kuchipudi	Regha Menon	p:+919656298894	menonregha663@gmail.com	Bachelor's degree
l:1065451346068098	2026-08-30T21:52:28+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	carnatic_music	Rajesh cR	p:+971501815281	rajesh2172011@gmail.com	High school / GED
l:4386136711699186	2026-08-30T03:46:49+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	bharatanatyam	Preethy Rajesh	p:+971507907401	preethyrajesh86@gmail.com	Bachelor's degree
l:1090289103523518	2026-08-29T16:50:48+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	bharatanatyam	Ciceena	p:+919746937387	Ciceena1004@gmail.com	Bachelor's degree
l:1562391998948160	2026-08-29T15:56:57+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	bharatanatyam	Dr Gopika Leela Gopinathan Darshith	p:+12269779506	gopika.leelagopinath@gmail.com	Post-graduate degree
l:1734904881079674	2026-08-29T15:41:13+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	Jaya Prabha	p:+447555851163	jayaprabha289@gmail.com	High school / GED
l:1069218499139236	2026-08-29T15:29:53+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	Savitha Vasavan	p:+919946512637	savithavasavan@gmail.com	Bachelor's degree
l:1511146037435637	2026-08-29T14:47:03+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	Akhila Shaji	p:+353874612559	akhilashaji216@gmail.com	Bachelor's degree
l:1458117669484048	2026-08-29T14:34:13+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	Queenlyvibes	p:+96890644761	cicily.vineetha@asterhospital.com	High school / GED
l:1221188916862225	2026-08-29T06:32:40+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	carnatic_music	Abdul Muthalib	p:+971524142370	abdulmuthalib7701@gmail.com	Bachelor's degree
l:1720564452354997	2026-08-28T22:01:17+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	Ambily Jayakumar	p:+14388667155	ambilyjayakumar1987@gmail.com	Bachelor's degree
l:2487867495033453	2026-08-28T20:24:47+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	vineetha sudeesh	p:+353894730136	vineethavijayan143@gmail.com	Post-graduate degree
l:2111082683625419	2026-08-28T20:04:48+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	Jeethu Gopinath	p:+918157821704	Jeethugopinath27@gmail.com	Post-graduate degree
l:1335691028398037	2026-08-28T14:48:32+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	Anumol Abraham	p:+971526381064	anumolabraham64@gmail.com	Bachelor's degree
l:1008032282204005	2026-08-28T13:53:45+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	carnatic_music	priya	p:+917339669009	priyamaheshriyana@gmail.com	Bachelor's degree
l:1575071750829956	2026-08-28T10:47:55+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	Dr. Anna Ealias(PT)	p:+447436378431	annaealias1996@gmail.com	Bachelor's degree
l:1772465627433442	2026-08-28T04:30:30+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	mohiniyattam	...chithra Chandrabhanu	p:+447586412638	chithrasheelachandrabhanu@gmail.com	Bachelor's degree
l:1788649802158034	2026-08-28T03:47:54+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	bharatanatyam	Resmi balachandran	p:+447774187449	resmibala1988@gmail.com	Bachelor's degree
l:2995424314172263	2026-08-28T01:06:33+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	bharatanatyam	Tincy Thomas	p:+447447263393	tinzej@gmail.com	Some high school
l:899113206272202	2026-08-27T22:57:32+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	Aiswarya Lakshmi	p:+918943701199	aiswaryalakshmi128@gmail.com	Bachelor's degree
l:3119623441569841	2026-08-27T18:56:00+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	bharatanatyam	anju	p:+971551651877	anjusasidharan2016@gmail.com	Post-graduate degree
l:2595300354226792	2026-08-27T18:40:07+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	bharatanatyam	Anjana Vijayan	p:+447867082668	shyamchocho@gmail.com	Post-graduate degree
l:1987991278576471	2026-08-27T17:40:17+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	bharatanatyam	Diana Dominic	p:+971508813524	dianadominic21@gmail.com	Bachelor's degree
l:1405885701032609	2026-08-27T16:41:05+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	Ardra	p:+971582875427	Ardra.31@gmail.com	Bachelor's degree
l:1322656803071727	2026-08-26T22:25:18+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	bharatanatyam	Selency Sebastian	p:+971562103309	selusebast113@gmail.com	Bachelor's degree
l:1060303763034793	2026-08-26T18:38:00+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	bharatanatyam	Deepthi	p:+971503663681	bijudivakaran1391@gmail.com	Post-graduate degree
l:3316839278518278	2026-08-26T16:05:21+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	bharatanatyam	Shilby Sebastian	p:+447721543904	pshilbyseban@gmIl.com	Bachelor's degree
l:27761928673507818	2026-08-26T15:44:12+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	kuchipudi	Reena Devassy	p:+493060938104	reenamathew04@gmail.com	Post-graduate degree
l:1418710716821883	2026-08-26T14:51:26+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	Shyama Susan	p:+96896321009	shyama.susan2020@gmail.com	Bachelor's degree
l:1072336708679847	2026-08-26T12:19:05+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	bharatanatyam	sheheer	p:+919539913132	sheheerhdulu@gmail.com	Bachelor's degree
l:1409698097751119	2026-08-26T10:11:23+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	bharatanatyam	Freshi Lijo	p:+919946126776	freshifrancis88@gmail.com	Bachelor's degree
l:1810461359939188	2026-08-26T04:23:02+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	Rekha Vinodchandran	p:+447503759775	rekhavinodchandran@gmail.com	Bachelor's degree
l:2588286674952320	2026-08-25T19:29:37+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	Nidhi15	p:+353892686715	ipreethynair@gmail.com	Bachelor's degree
l:1698469962231992	2026-08-25T11:54:09+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	Prana_not_Prada	p:+971521296777	athirasudhakaranpillai@gmail.com	Bachelor's degree
l:2546776005743323	2026-08-25T11:22:24+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	Mrs.Sharan	p:+918008543921	dalalishivaniraj@gmail.com	Bachelor's degree
l:1749482159504936	2026-08-25T01:47:50+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	fb	bharatanatyam	Mahendra Walpola	p:+96896194406	walpola2002@yahoo.com	Bachelor's degree
l:1043861258633440	2026-08-25T00:04:00+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	Aghila Nandakumar	p:+447767559126	aghilanandakumar@gmail.com	Post-graduate degree
l:1051991297574046	2026-08-24T23:10:49+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	ℝ𝕖𝕙𝕒𝕟𝕒	p:+919778124737	rehanaramsad22@gmail.com	Some college / Associate's degree
l:29178547048402213	2026-08-24T18:57:25+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	mohiniyattam	Suma K.K	p:+96892181494	suminsuma5585@gmail.com	Some college / Associate's degree
l:1384152733848345	2026-08-24T18:09:31+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	carnatic_music	Sruthy Sangeeth	p:+919895837644	sruthysangeeth8@gmail.com	Post-graduate degree
l:1431216802402189	2026-08-24T16:34:58+05:30	ag:120256484322050715	ABROAD REGULAR - 24/8/26	as:120256484322060715	ABROAD REGULAR - 24/8/26	c:120256484322070715	ABROAD REGULAR - 24/8/26	f:2295576760978334	ABROAD REGULAR - 24/8/26	FALSE	ig	bharatanatyam	Tintu Mathew	p:+353892122650	tintususannamathew92@gmail.com	Bachelor's degree
"""

lines = tsv_data.strip().split('\n')
header = lines[0].split('\t')

name_idx = header.index('full_name')
phone_idx = header.index('phone_number')
email_idx = header.index('email')

print("Starting fix of bulk uploaded leads country codes...")
updated_count = 0

for line in lines[1:]:
    if not line:
        continue
    parts = line.split('\t')
    if len(parts) <= max(name_idx, phone_idx, email_idx):
        continue
        
    name = parts[name_idx].strip()
    raw_phone = parts[phone_idx].strip()
    email = parts[email_idx].strip()
    
    # Sanitize phone
    if raw_phone.lower().startswith('p:'):
        raw_phone = raw_phone[2:].strip()
    if raw_phone.lower().startswith('p;'):
        raw_phone = raw_phone[2:].strip()
    raw_phone = raw_phone.replace(' ', '')
    
    correct_phone = normalize_phone_number(raw_phone)
    if not correct_phone:
        continue
        
    # Replicate old normalization to find the student (last 10 digits)
    digits_only = ''.join(c for c in raw_phone if c.isdigit())
    old_normalized_suffix = digits_only[-10:] if len(digits_only) >= 10 else digits_only
    
    # Find student by email, or by name + mobile
    student = None
    if email:
        student = Student.objects.filter(email__iexact=email).first()
    if not student:
        # Fallback to suffix matching
        student = Student.objects.filter(mobile__endswith=old_normalized_suffix).first()
        
    if student:
        old_mobile = student.mobile
        if old_mobile != correct_phone:
            try:
                with django_db_transaction.atomic():
                    student.mobile = correct_phone
                    student.save()
                    
                    user = student.user
                    if user:
                        clean_username = f"st_{correct_phone.replace('+', '')}"
                        if user.username != clean_username:
                            if not User.objects.filter(username=clean_username).exists():
                                user.username = clean_username
                                user.save()
                    
                    print(f"  - Updated {student.first_name} {student.last_name}: {old_mobile} -> {correct_phone}")
                    updated_count += 1
            except Exception as e:
                print(f"  - Error updating {name}: {e}")
        else:
            print(f"  - Already correct for {student.first_name} {student.last_name}: {correct_phone}")
    else:
        print(f"  - Student not found: {name} (Email: {email}, Phone: {raw_phone})")

print(f"\nFinished! Total leads updated: {updated_count}")
