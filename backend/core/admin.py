from django.contrib import admin
from .models import Program, SubProgram, Course, Batch, Student, Transaction, Document

@admin.register(Program)
class ProgramAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug')
    search_fields = ('name',)

@admin.register(SubProgram)
class SubProgramAdmin(admin.ModelAdmin):
    list_display = ('name', 'program')
    list_filter = ('program',)
    search_fields = ('name',)

@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ('name', 'sub_program', 'fee_amount')
    list_filter = ('sub_program',)
    search_fields = ('name',)

@admin.register(Batch)
class BatchAdmin(admin.ModelAdmin):
    list_display = ('name', 'course', 'start_date', 'end_date', 'primary_mentor')
    list_filter = ('course', 'start_date')
    search_fields = ('name',)

@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ('first_name', 'last_name', 'crm_student_id', 'program_type', 'is_active')
    list_filter = ('program_type', 'sub_program', 'course', 'is_active')
    search_fields = ('first_name', 'last_name', 'crm_student_id', 'email', 'mobile')

@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ('transaction_id', 'student', 'amount', 'date')
    search_fields = ('transaction_id', 'student__first_name', 'student__last_name')

@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ('student', 'document_type', 'uploaded_at')
    list_filter = ('document_type',)
    search_fields = ('student__first_name', 'student__last_name')

from .models import Exam, Question, QuestionOption, StudentSubmission

@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ('title', 'batch', 'exam_type', 'date', 'is_published')
    list_filter = ('exam_type', 'is_published', 'batch')

@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ('text', 'exam', 'question_type', 'marks')
    list_filter = ('exam', 'question_type')

@admin.register(QuestionOption)
class QuestionOptionAdmin(admin.ModelAdmin):
    list_display = ('option_text', 'question', 'is_correct')
    list_filter = ('is_correct',)

@admin.register(StudentSubmission)
class StudentSubmissionAdmin(admin.ModelAdmin):
    list_display = ('student', 'exam', 'score', 'is_submitted')
    list_filter = ('exam', 'is_submitted')
