
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { motion } from 'framer-motion';
import { FileText, User, Calendar, BookOpen, Search, X, Key, Edit, Users, History, RefreshCw, UserMinus, Download, IndianRupee } from 'lucide-react';

const MentorModule = () => {
    // Data State
    const [batches, setBatches] = useState([]);
    const [batchPagination, setBatchPagination] = useState({ count: 0, next: null, previous: null });
    const [batchPage, setBatchPage] = useState(1);
    const [programs, setPrograms] = useState([]);
    const [subPrograms, setSubPrograms] = useState([]);
    const [courses, setCourses] = useState([]);
    const [allCourses, setAllCourses] = useState([]);
    const [mentors, setMentors] = useState([]);
    const { user: authUser } = useAuth();
    
    // Team View State
    const [selectedTeamMentor, setSelectedTeamMentor] = useState('');

    // UI State
    const [selectedBatch, setSelectedBatch] = useState(null);
    const [studentsInBatch, setStudentsInBatch] = useState([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [unassignedStudents, setUnassignedStudents] = useState([]);
    const [selectedStudentProfile, setSelectedStudentProfile] = useState(null);
    const [studentLmsData, setStudentLmsData] = useState(null);
    const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState(false);
    const [credentialStudent, setCredentialStudent] = useState(null);
    const [credentialForm, setCredentialForm] = useState({ username: '', password: '' });
    const [allStudents, setAllStudents] = useState([]);
    const [viewTab, setViewTab] = useState('dashboard'); // 'dashboard', 'batches', 'all-students', 'wise-courses'
    const [wiseCourses, setWiseCourses] = useState([]);
    const [selectedWiseCourse, setSelectedWiseCourse] = useState(null);
    const [wiseParticipants, setWiseParticipants] = useState([]);
    const [studentSearchQuery, setStudentSearchQuery] = useState('');
    const [studentFilterProgram, setStudentFilterProgram] = useState('');
    const [studentFilterCourse, setStudentFilterCourse] = useState('');
    const [studentFilterBatch, setStudentFilterBatch] = useState('');
    const [studentFilterStatus, setStudentFilterStatus] = useState('');
    const [unassignedSearchQuery, setUnassignedSearchQuery] = useState('');
    const [selectedUnassignedStudents, setSelectedUnassignedStudents] = useState([]);
    const [studentPage, setStudentPage] = useState(1);
    const [studentPagination, setStudentPagination] = useState({ count: 0, next: null, previous: null });
    const [batchSearchQuery, setBatchSearchQuery] = useState('');

    // Wise ID Linking State
    const [isWiseLinkModalOpen, setIsWiseLinkModalOpen] = useState(false);
    const [wiseLinkStudent, setWiseLinkStudent] = useState(null);
    const [wiseIdInput, setWiseIdInput] = useState('');
    const [unassignedPage, setUnassignedPage] = useState(1);
    const [unassignedPagination, setUnassignedPagination] = useState({ count: 0, next: null, previous: null });
    const [teachers, setTeachers] = useState([]);
    const [isAssignTeacherModalOpen, setIsAssignTeacherModalOpen] = useState(false);

    // Selection state for Create Modal
    const [selectedProgramId, setSelectedProgramId] = useState('');
    const [selectedSubProgramId, setSelectedSubProgramId] = useState('');

    // Form Data for New Batch
    const [newBatch, setNewBatch] = useState({
        name: '',
        course: '',
        start_date: '',
        end_date: '',
        secondary_mentors: []
    });
    const [isEditMode, setIsEditMode] = useState(false);
    
    // Break & Rejoin State
    const [breakMetrics, setBreakMetrics] = useState({ on_break_count: 0, rejoined_count: 0, on_break: [], rejoined: [] });
    const [isBreakModalOpen, setIsBreakModalOpen] = useState(false);
    
    // Fee State
    const [feeDefaulters, setFeeDefaulters] = useState([]);
    const [isFeeModalOpen, setIsFeeModalOpen] = useState(false);
    const [collectedFees, setCollectedFees] = useState([]);
    const [isCollectedModalOpen, setIsCollectedModalOpen] = useState(false);

    // Filter states for interactive fee modals
    const [dueSearch, setDueSearch] = useState('');
    const [dueFilterBatch, setDueFilterBatch] = useState('');
    const [dueFilterMentor, setDueFilterMentor] = useState('');

    const [collectedSearch, setCollectedSearch] = useState('');
    const [collectedFilterBatch, setCollectedFilterBatch] = useState('');
    const [collectedFilterMentor, setCollectedFilterMentor] = useState('');
    const [collectedFilterType, setCollectedFilterType] = useState('All');

    const [breakReason, setBreakReason] = useState('');
    const [breakStudentId, setBreakStudentId] = useState(null);
    const [breakStartDate, setBreakStartDate] = useState('');
    const [breakEndDate, setBreakEndDate] = useState('');
    const [isBreakListModalOpen, setIsBreakListModalOpen] = useState(false);
    const [breakListModalType, setBreakListModalType] = useState('on_break'); // 'on_break', 'rejoined', 'discontinued'
    const [modalSearchQuery, setModalSearchQuery] = useState('');
    const [modalStartDate, setModalStartDate] = useState('');
    const [modalEndDate, setModalEndDate] = useState('');
    const [modalSortConfig, setModalSortConfig] = useState({ key: 'date', direction: 'desc' });
    
    // Discontinued State
    const [isDiscontinueModalOpen, setIsDiscontinueModalOpen] = useState(false);
    const [discontinueReason, setDiscontinueReason] = useState('');
    const [discontinueStudentId, setDiscontinueStudentId] = useState(null);
    const [discontinueDate, setDiscontinueDate] = useState(new Date().toISOString().split('T')[0]);

    // Rejoin State
    const [isRejoinModalOpen, setIsRejoinModalOpen] = useState(false);
    const [rejoinStudentId, setRejoinStudentId] = useState(null);
    const [rejoinDate, setRejoinDate] = useState(new Date().toISOString().split('T')[0]);
    
    // Batch Reassignment State
    const [isReassignBatchModalOpen, setIsReassignBatchModalOpen] = useState(false);
    const [reassignBatchData, setReassignBatchData] = useState({ new_mentor_id: '', reason: '' });
    const [isBatchHistoryModalOpen, setIsBatchHistoryModalOpen] = useState(false);
    const [batchHistoryData, setBatchHistoryData] = useState([]);

    // Monthly payment states
    const [isMarkPaidModalOpen, setIsMarkPaidModalOpen] = useState(false);
    const [markPaidStudent, setMarkPaidStudent] = useState(null);
    const [markPaidForm, setMarkPaidForm] = useState({ amount: '', notes: '', numberOfMonths: 1 });
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [historyStudent, setHistoryStudent] = useState(null);
    const [paymentHistory, setPaymentHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [dashboardStats, setDashboardStats] = useState(null);

    useEffect(() => {
        if (isAddStudentModalOpen) {
            fetchUnassignedStudents();
        }
    }, [unassignedPage, unassignedSearchQuery, isAddStudentModalOpen]);

    useEffect(() => {
        if (selectedStudentProfile) {
            fetchStudentLmsData(selectedStudentProfile.id);
        } else {
            setStudentLmsData(null);
        }
    }, [selectedStudentProfile]);

    const fetchStudentLmsData = async (studentId) => {
        try {
            const res = await api.get(`integrations/details/?student_id=${studentId}`);
            setStudentLmsData(res.data);
        } catch (err) {
            console.error("Failed to fetch student LMS data", err);
        }
    };

    useEffect(() => {
        // Redundant fetchUser removed, using authUser from context
        fetchBatches();
        fetchMeta();
        fetchDashboardStats();
    }, [batchPage]); // Re-fetch batches when page changes

    useEffect(() => {
        if (viewTab === 'batches') {
            const timer = setTimeout(() => {
                if (batchPage !== 1) {
                    setBatchPage(1); // Reset to page 1 on search
                } else {
                    fetchBatches();
                }
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [batchSearchQuery]);

    useEffect(() => {
        if (viewTab === 'all-students') {
            fetchStudentsWithPagination();
        } else if (viewTab === 'wise-courses') {
            fetchWiseCourses();
        } else if (viewTab === 'dashboard') {
            fetchBreakMetrics();
            fetchFeeDefaulters();
            fetchCollectedFees();
            fetchDashboardStats();
        }
    }, [viewTab, studentPage]);

    useEffect(() => {
        if (viewTab === 'dashboard') {
            fetchBreakMetrics();
            fetchFeeDefaulters();
            fetchCollectedFees();
        }
    }, [breakStartDate, breakEndDate]);

    const fetchFeeDefaulters = async () => {
        try {
            let url = 'students/fee_defaulters/';
            const params = [];
            if (breakStartDate) params.push(`start_date=${breakStartDate}`);
            if (breakEndDate) params.push(`end_date=${breakEndDate}`);
            if (params.length > 0) url += `?${params.join('&')}`;
            
            const res = await api.get(url);
            setFeeDefaulters(res.data);
        } catch (err) {
            console.error("Failed to fetch fee defaulters", err);
        }
    };

    const fetchCollectedFees = async () => {
        try {
            let url = 'students/collected_fees/';
            const params = [];
            if (breakStartDate) params.push(`start_date=${breakStartDate}`);
            if (breakEndDate) params.push(`end_date=${breakEndDate}`);
            if (params.length > 0) url += `?${params.join('&')}`;
            
            const res = await api.get(url);
            setCollectedFees(res.data);
        } catch (err) {
            console.error("Failed to fetch collected fees", err);
        }
    };

    const exportDefaultersCSV = (defaultersList) => {
        try {
            const headers = ['Student Name', 'CRM Student ID', 'Mobile', 'Email', 'Batch', 'Assigned Mentor', 'Total Fee', 'Paid Fee', 'Due Amount', 'Due Date'];
            const rows = defaultersList.map(s => [
                s.name,
                s.crm_student_id,
                s.mobile || '',
                s.email || '',
                s.batch_name,
                s.mentor_name,
                s.total_fee,
                s.paid_fee,
                s.due_amount,
                s.fee_due_date || ''
            ]);
            
            let csvContent = "data:text/csv;charset=utf-8," 
                + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
            
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `due_fees_report_${new Date().toISOString().slice(0,10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error("Failed to export defaulters CSV", err);
            alert("Failed to export CSV file");
        }
    };

    const exportCollectedCSV = (collectedList) => {
        try {
            const headers = ['Student Name', 'CRM Student ID', 'Batch', 'Assigned Mentor', 'Amount', 'Payment Date', 'Type', 'Ref ID / Notes'];
            const rows = collectedList.map(p => [
                p.student_name,
                p.crm_student_id || '',
                p.batch_name,
                p.mentor_name,
                p.amount,
                p.date,
                p.type,
                p.ref_id || ''
            ]);
            
            let csvContent = "data:text/csv;charset=utf-8," 
                + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
            
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `collected_fees_report_${new Date().toISOString().slice(0,10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error("Failed to export collected CSV", err);
            alert("Failed to export CSV file");
        }
    };

    const fetchDashboardStats = async () => {
        try {
            const res = await api.get(`dashboard-stats/${selectedTeamMentor ? `?mentor_id=${selectedTeamMentor}` : ''}`);
            setDashboardStats(res.data);
        } catch (err) {
            console.error("Failed to fetch dashboard stats", err);
        }
    };

    const updateStudentPaymentState = (studentId, monthsList, isPaid) => {
        const updateList = (list) => 
            list.map(s => {
                if (s.id === studentId) {
                    let currentMonths = s.monthly_payment_months || [];
                    if (isPaid) {
                        // Add all months in monthsList that aren't already present
                        monthsList.forEach(m => {
                            if (!currentMonths.includes(m)) {
                                currentMonths.push(m);
                            }
                        });
                    } else {
                        // Remove all months in monthsList
                        currentMonths = currentMonths.filter(m => !monthsList.includes(m));
                    }
                    return { ...s, monthly_payment_months: [...currentMonths] };
                }
                return s;
            });

        setAllStudents(prev => updateList(prev));
        setStudentsInBatch(prev => updateList(prev));
    };

    const openMarkPaidModal = (student) => {
        setMarkPaidStudent(student);
        setMarkPaidForm({
            amount: student.total_fee || '',
            notes: '',
            numberOfMonths: 1
        });
        setIsMarkPaidModalOpen(true);
    };

    const handleMarkPaidSubmit = async (e) => {
        e.preventDefault();
        if (!markPaidStudent) return;
        setLoading(true);
        try {
            const monthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
            const res = await api.post(`students/${markPaidStudent.id}/mark-paid/`, {
                month: monthStr,
                amount: markPaidForm.amount,
                notes: markPaidForm.notes,
                number_of_months: markPaidForm.numberOfMonths
            });
            alert(`Monthly payment marked successfully for ${markPaidStudent.first_name}`);
            
            // Backend returns 'months' array containing all marked months
            const markedMonths = res.data.months || [monthStr];
            updateStudentPaymentState(markPaidStudent.id, markedMonths, true);
            
            setIsMarkPaidModalOpen(false);
            fetchFeeDefaulters();
            fetchCollectedFees();
            fetchDashboardStats();
        } catch (err) {
            console.error("Failed to mark monthly payment as paid", err);
            alert(err.response?.data?.error || "Failed to mark payment");
        } finally {
            setLoading(false);
        }
    };

    const handleUnmarkPaid = async (student, monthStr = null) => {
        const targetMonth = monthStr || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
        const dateObj = new Date(targetMonth + 'T00:00:00');
        const formattedMonth = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });

        if (!window.confirm(`Are you sure you want to unmark the ${formattedMonth} payment for ${student.first_name}?`)) return;
        setLoading(true);
        try {
            await api.post(`students/${student.id}/unmark-paid/`, {
                month: targetMonth
            });
            alert(`Payment unmarked for ${formattedMonth}`);
            updateStudentPaymentState(student.id, [targetMonth], false);
            
            // If the history modal is open for this student, refresh it
            if (isHistoryModalOpen && historyStudent && historyStudent.id === student.id) {
                const res = await api.get(`students/${student.id}/payment-history/`);
                setPaymentHistory(res.data);
            }

            fetchFeeDefaulters();
            fetchCollectedFees();
            fetchDashboardStats();
        } catch (err) {
            console.error("Failed to unmark payment", err);
            alert(err.response?.data?.error || "Failed to unmark payment");
        } finally {
            setLoading(false);
        }
    };

    const openHistoryModal = async (student) => {
        setHistoryStudent(student);
        setIsHistoryModalOpen(true);
        setHistoryLoading(true);
        try {
            const res = await api.get(`students/${student.id}/payment-history/`);
            setPaymentHistory(res.data);
        } catch (err) {
            console.error("Failed to fetch payment history", err);
            alert("Failed to load payment history");
        } finally {
            setHistoryLoading(false);
        }
    };

    const fetchBreakMetrics = async () => {
        try {
            let url = 'students/break_metrics/';
            const params = new URLSearchParams();
            if (breakStartDate) params.append('start_date', breakStartDate);
            if (breakEndDate) params.append('end_date', breakEndDate);
            if (params.toString()) url += `?${params.toString()}`;
            
            const res = await api.get(url);
            setBreakMetrics(res.data);
        } catch (err) {
            console.error("Failed to fetch break metrics", err);
        }
    };

    const getCurrentBreakList = () => {
        if (breakListModalType === 'on_break') return breakMetrics.on_break || [];
        if (breakListModalType === 'rejoined') return breakMetrics.rejoined || [];
        if (breakListModalType === 'discontinued') return breakMetrics.discontinued || [];
        return [];
    };

    const getProcessedBreakList = () => {
        let displayList = [...getCurrentBreakList()];
        
        if (modalSearchQuery) {
            const query = modalSearchQuery.toLowerCase();
            displayList = displayList.filter(s => 
                (s.name && s.name.toLowerCase().includes(query)) || 
                (s.reason && s.reason.toLowerCase().includes(query)) ||
                (s.crm_student_id && s.crm_student_id.toLowerCase().includes(query))
            );
        }
        
        if (modalStartDate) {
            displayList = displayList.filter(s => {
                const dateToUse = breakListModalType === 'rejoined' ? s.rejoin_date : s.date;
                return dateToUse && dateToUse >= modalStartDate;
            });
        }
        
        if (modalEndDate) {
            displayList = displayList.filter(s => {
                const dateToUse = breakListModalType === 'rejoined' ? s.rejoin_date : s.date;
                return dateToUse && dateToUse <= modalEndDate;
            });
        }
        
        displayList.sort((a, b) => {
            let valA = a[modalSortConfig.key];
            let valB = b[modalSortConfig.key];
            
            if (modalSortConfig.key === 'date') {
                valA = breakListModalType === 'rejoined' ? a.break_date : a.date;
                valB = breakListModalType === 'rejoined' ? b.break_date : b.date;
            } else if (modalSortConfig.key === 'rejoin_date') {
                valA = a.rejoin_date;
                valB = b.rejoin_date;
            } else if (modalSortConfig.key === 'name') {
                valA = a.name;
                valB = b.name;
            }
            
            if (!valA && valB) return modalSortConfig.direction === 'asc' ? -1 : 1;
            if (valA && !valB) return modalSortConfig.direction === 'asc' ? 1 : -1;
            if (!valA && !valB) return 0;

            if (valA < valB) return modalSortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return modalSortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        
        return displayList;
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (modalSortConfig.key === key && modalSortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setModalSortConfig({ key, direction });
    };

    const handleExportBreakList = () => {
        const list = getProcessedBreakList();
        if (!list || list.length === 0) return;

        let csvContent = "data:text/csv;charset=utf-8,";
        const headers = ["ID", "Name", "Mobile", "Email", "Reason"];
        if (breakListModalType === 'rejoined') {
            headers.push("Break Date", "Rejoin Date");
        } else if (breakListModalType === 'discontinued') {
            headers.push("Discontinued Date");
        } else {
            headers.push("Break Date");
        }
        
        csvContent += headers.join(",") + "\n";
        
        list.forEach(item => {
            const row = [
                item.crm_student_id,
                `"${item.name}"`,
                item.mobile,
                item.email,
                `"${item.reason}"`
            ];
            if (breakListModalType === 'rejoined') {
                row.push(item.break_date, item.rejoin_date);
            } else {
                row.push(item.date);
            }
            csvContent += row.join(",") + "\n";
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${breakListModalType}_students.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Re-fetch data when team mentor filter changes
    useEffect(() => {
        if (viewTab === 'dashboard') fetchDashboardStats();
        if (viewTab === 'batches') fetchBatches();
        if (viewTab === 'all-students') fetchStudentsWithPagination();
    }, [selectedTeamMentor]);

    // Handle viewTab changes with debounce
    useEffect(() => {
        if (viewTab === 'all-students') {
            const timer = setTimeout(() => {
                setStudentPage(1); // Reset to page 1 on search
                fetchStudentsWithPagination();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [studentSearchQuery, studentFilterProgram, studentFilterCourse, studentFilterBatch, studentFilterStatus, selectedTeamMentor]);

    const handleExportFilteredStudents = async () => {
        try {
            setLoading(true);
            let url = `students/export_csv/?lead_status=CONVERTED`;
            if (studentSearchQuery) url += `&search=${studentSearchQuery}`;
            if (studentFilterProgram) url += `&program=${studentFilterProgram}`;
            if (studentFilterCourse) url += `&course=${studentFilterCourse}`;
            if (studentFilterBatch) url += `&batch=${studentFilterBatch}`;
            if (studentFilterStatus) url += `&academic_status=${studentFilterStatus}`;
            if (selectedTeamMentor) url += `&mentor_id=${selectedTeamMentor}`;
            
            const res = await api.get(url, { responseType: 'blob' });
            const urlBlob = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = urlBlob;
            link.setAttribute('download', 'filtered_students.csv');
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error("Export failed:", error);
            alert("Failed to export students.");
        } finally {
            setLoading(false);
        }
    };

    const fetchStudentsWithPagination = async () => {
        try {
            setLoading(true);
            let url = `students/?page=${studentPage}&search=${studentSearchQuery}&lead_status=CONVERTED`;
            if (studentFilterProgram) url += `&program=${studentFilterProgram}`;
            if (studentFilterCourse) url += `&course=${studentFilterCourse}`;
            if (studentFilterBatch) url += `&batch=${studentFilterBatch}`;
            if (studentFilterStatus) url += `&academic_status=${studentFilterStatus}`;
            if (selectedTeamMentor) url += `&mentor_id=${selectedTeamMentor}`;
            
            const res = await api.get(url);
            const data = res.data;
            if (data.results) {
                setAllStudents(data.results);
                setStudentPagination({
                    count: data.count,
                    next: data.next,
                    previous: data.previous
                });
            } else {
                setAllStudents(Array.isArray(data) ? data : []);
                setStudentPagination({ count: Array.isArray(data) ? data.length : 0, next: null, previous: null });
            }
        } catch (err) {
            console.error("Failed to fetch all students", err);
        } finally {
            setLoading(false);
        }
    };

    // fetchUser removed as we use useAuth()


    const fetchWiseCourses = async () => {
        try {
            setLoading(true);
            const res = await api.get('integrations/courses/?type=ALL');
            setWiseCourses(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchWiseParticipants = async (courseId) => {
        try {
            setLoading(true);
            const res = await api.get(`integrations/courses/${courseId}/participants/`);
            setWiseParticipants(res.data);
            setSelectedWiseCourse(wiseCourses.find(c => c._id === courseId));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const syncWiseBatch = async (courseId) => {
        if (!window.confirm("This will create a new Batch in CRM and import all students from Wise LMS. Proceed?")) return;
        try {
            setLoading(true);
            const res = await api.post('integrations/sync-batch/', { class_id: courseId });
            alert(res.data.message);
            setViewTab('batches');
            fetchBatches();
        } catch (err) {
            console.error(err);
            alert("Sync failed: " + (err.response?.data?.error || "Unknown error"));
        } finally {
            setLoading(false);
        }
    };

    const syncAllWiseBatches = async () => {
        if (!window.confirm(`This will sync all ${wiseCourses.length} batches from Wise LMS to the CRM. This might take a minute. Proceed?`)) return;
        
        try {
            setLoading(true);
            let successCount = 0;
            let failCount = 0;
            
            for (const course of wiseCourses) {
                try {
                    await api.post('integrations/sync-batch/', { class_id: course._id });
                    successCount++;
                } catch (e) {
                    console.error("Failed to sync course:", course._id, e);
                    failCount++;
                }
            }
            
            alert(`Sync Complete! Successfully synced ${successCount} batches. ${failCount > 0 ? `Failed: ${failCount}` : ''}`);
            setViewTab('batches');
            fetchBatches();
        } catch (err) {
            console.error(err);
            alert("An error occurred during bulk sync.");
        } finally {
            setLoading(false);
        }
    };

    const fetchBatches = async () => {
        try {
            let url = `batches/?page=${batchPage}&search=${batchSearchQuery}`;
            if (selectedTeamMentor) url += `&mentor_id=${selectedTeamMentor}`;
            const res = await api.get(url);
            if (res.data.results) {
                setBatches(res.data.results);
                setBatchPagination({
                    count: res.data.count,
                    next: res.data.next,
                    previous: res.data.previous
                });
            } else {
                setBatches(Array.isArray(res.data) ? res.data : []);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchMeta = async () => {
        try {
            const [progRes, mentorRes, teacherRes, courseRes] = await Promise.all([
                api.get('programs/'),
                api.get('auth/mentors/'),
                api.get('auth/teachers/'),
                api.get('courses/')
            ]);
            setPrograms(progRes.data);
            setMentors(mentorRes.data);
            setTeachers(teacherRes.data);
            setAllCourses(courseRes.data);
        } catch (err) {
            console.error(err);
        }
    };

    // Cascading effects for creation
    useEffect(() => {
        if (selectedProgramId) {
            fetchSubPrograms(selectedProgramId);
            setSelectedSubProgramId('');
            setNewBatch(prev => ({ ...prev, course: '' }));
        } else {
            setSubPrograms([]);
            setCourses([]);
        }
    }, [selectedProgramId]);

    useEffect(() => {
        if (selectedSubProgramId) {
            fetchCourses(selectedSubProgramId);
            setNewBatch(prev => ({ ...prev, course: '' }));
        } else {
            setCourses([]);
        }
    }, [selectedSubProgramId]);

    const fetchSubPrograms = async (progId) => {
        try {
            const res = await api.get(`sub-programs/?program=${progId}`);
            setSubPrograms(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchCourses = async (subProgId) => {
        try {
            const res = await api.get(`courses/?sub_program=${subProgId}`);
            setCourses(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleBatchClick = async (batch) => {
        setSelectedBatch(batch);
        setLoading(true);
        try {
            const res = await api.get(`students/?batch=${batch.id}&lead_status=CONVERTED`);
            setStudentsInBatch(res.data?.results || res.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };


    const handleReassignBatch = async (e) => {
        e.preventDefault();
        if (!reassignBatchData.new_mentor_id) return;
        setLoading(true);
        try {
            await api.post(`batches/${selectedBatch.id}/reassign/`, reassignBatchData);
            setIsReassignBatchModalOpen(false);
            setReassignBatchData({ new_mentor_id: '', reason: '' });
            fetchBatches();
            // Fetch updated selected batch info
            const res = await api.get(`batches/${selectedBatch.id}/`);
            setSelectedBatch(res.data);
        } catch (err) {
            console.error("Failed to reassign batch", err);
            alert(err.response?.data?.error || "Failed to reassign batch");
        } finally {
            setLoading(false);
        }
    };

    const handleViewBatchHistory = async () => {
        setLoading(true);
        try {
            const res = await api.get(`batches/${selectedBatch.id}/assignment_history/`);
            setBatchHistoryData(res.data);
            setIsBatchHistoryModalOpen(true);
        } catch (err) {
            console.error("Failed to fetch batch history", err);
        } finally {
            setLoading(false);
        }
    };

    const handleEditBatch = () => {
        setNewBatch({
            name: selectedBatch.name,
            course: selectedBatch.course,
            start_date: selectedBatch.start_date,
            end_date: selectedBatch.end_date,
            secondary_mentors: selectedBatch.secondary_mentors || []
        });
        setIsEditMode(true);
        setIsCreateModalOpen(true);
    };

    const handleSaveBatch = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...newBatch,
                primary_mentor: isEditMode ? selectedBatch.primary_mentor : authUser.id
            };

            if (isEditMode) {
                await api.patch(`batches/${selectedBatch.id}/`, payload);
                alert("Batch updated successfully");
            } else {
                await api.post('batches/', payload);
                alert("Batch created successfully");
            }

            setIsCreateModalOpen(false);
            setIsEditMode(false);
            fetchBatches();

            // Refresh selected batch if we are editing it
            if (isEditMode && selectedBatch) {
                // We need to fetch the updated batch details or just update local state partially
                // Ideally fetch the specific batch again
                const res = await api.get(`batches/${selectedBatch.id}/`);
                setSelectedBatch(res.data);
            }

            setNewBatch({ name: '', course: '', start_date: '', end_date: '', secondary_mentors: [] });
            setSelectedProgramId('');
            setSelectedSubProgramId('');
        } catch (err) {
            console.error("Failed to save batch", err);
            alert("Failed to save batch");
        }
    };

    const fetchUnassignedStudents = async () => {
        try {
            setLoading(true);
            let url = `students/?unassigned=true&page=${unassignedPage}&lead_status=CONVERTED`;
            if (unassignedSearchQuery) {
                url += `&search=${encodeURIComponent(unassignedSearchQuery)}`;
            }
            const res = await api.get(url);
            const data = res.data;
            if (data.results) {
                setUnassignedStudents(data.results);
                setUnassignedPagination({
                    count: data.count,
                    next: data.next,
                    previous: data.previous
                });
            } else {
                setUnassignedStudents(Array.isArray(data) ? data : []);
                setUnassignedPagination({ count: data.length, next: null, previous: null });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const openAddStudentModal = () => {
        setUnassignedSearchQuery('');
        setUnassignedPage(1);
        setSelectedUnassignedStudents([]);
        setIsAddStudentModalOpen(true);
    };

    const addStudentToBatch = async (studentId) => {
        if (!selectedBatch) return;
        try {
            await api.post(`batches/${selectedBatch.id}/add_student/`, { student_id: studentId });
            // Refresh batch students
            const res = await api.get(`students/?batch=${selectedBatch.id}&lead_status=CONVERTED`);
            setStudentsInBatch(res.data?.results || res.data || []);
            setIsAddStudentModalOpen(false);
        } catch (err) {
            console.error(err);
            alert("Failed to add student");
        }
    };

    const bulkAddStudents = async () => {
        if (!selectedBatch || selectedUnassignedStudents.length === 0) return;
        try {
            setLoading(true);
            await api.post(`batches/${selectedBatch.id}/bulk_add_students/`, { student_ids: selectedUnassignedStudents });
            // Refresh batch students
            const res = await api.get(`students/?batch=${selectedBatch.id}&lead_status=CONVERTED`);
            setStudentsInBatch(res.data?.results || res.data || []);
            setIsAddStudentModalOpen(false);
            setSelectedUnassignedStudents([]);
        } catch (err) {
            console.error(err);
            alert("Failed to add students");
        } finally {
            setLoading(false);
        }
    };

    const toggleStudentSelection = (id) => {
        setSelectedUnassignedStudents(prev => 
            prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id]
        );
    };

    const handleAssignTeacher = async (batchId, teacherId) => {
        try {
            setLoading(true);
            await api.patch(`batches/${batchId}/`, { teacher: teacherId });
            // Refresh batch details
            const res = await api.get(`batches/${batchId}/`);
            setSelectedBatch(res.data);
            setIsAssignTeacherModalOpen(false);
            fetchBatches();
        } catch (err) {
            console.error("Failed to assign teacher", err);
            alert("Failed to assign teacher");
        } finally {
            setLoading(false);
        }
    };

    const removeStudentFromBatch = async (studentId) => {
        if (!selectedBatch || !window.confirm("Remove student from batch?")) return;
        try {
            await api.post(`batches/${selectedBatch.id}/remove_student/`, { student_id: studentId });
            // Refresh list
            const res = await api.get(`students/?batch=${selectedBatch.id}&lead_status=CONVERTED`);
            setStudentsInBatch(res.data?.results || res.data || []);
        } catch (err) {
            console.error(err);
            alert("Failed to remove student");
        }
    };

    const handleSetCredentials = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post(`students/${credentialStudent.id}/set_credentials/`, credentialForm);
            alert("Credentials updated successfully");
            setIsCredentialsModalOpen(false);
            setCredentialForm({ username: '', password: '' });
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.error || "Failed to update credentials");
        } finally {
            setLoading(false);
        }
    };

    // Open Wise Link Modal - Auto Link with Manual Fallback
    const handleWiseLinkClick = async (student) => {
        if (!student.mobile) {
            alert("Student has no mobile number for lookup.");
            setWiseLinkStudent(student);
            setWiseIdInput('');
            setIsWiseLinkModalOpen(true);
            return;
        }

        const confirmLink = window.confirm(`Attempt to auto-link ${student.first_name} with Wise LMS using phone number ${student.mobile}? \n\nClick Cancel to enter Wise ID manually.`);

        if (!confirmLink) {
            // Manual Link Trigger
            setWiseLinkStudent(student);
            setWiseIdInput(student.lms_student_id || '');
            setIsWiseLinkModalOpen(true);
            return;
        }

        setLoading(true);
        try {
            // Using the new auto-link endpoint
            const res = await api.post('/integrations/link-student/', {
                student_id: student.id
            });

            if (res.data.success) {
                alert(res.data.message);
                // Refresh list
                if (viewTab === 'batches' && selectedBatch) {
                    handleBatchClick(selectedBatch);
                } else {
                    fetchStudentsWithPagination();
                }
            }
        } catch (error) {
            console.error("Wise Link Error:", error);
            const errorMsg = error.response?.data?.error || "Failed to link student.";

            // Ask for manual fallback on failure
            if (window.confirm(`${errorMsg}\n\nWould you like to link manually by entering the Wise ID?`)) {
                setWiseLinkStudent(student);
                setWiseIdInput('');
                setIsWiseLinkModalOpen(true);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSaveWiseId = async (e) => {
        e.preventDefault();
        if (!wiseLinkStudent || !wiseIdInput) return;
        setLoading(true);
        try {
            await api.patch(`students/${wiseLinkStudent.id}/`, { lms_student_id: wiseIdInput });
            alert('Wise ID linked successfully!');
            setIsWiseLinkModalOpen(false);
            setWiseIdInput('');
            if (viewTab === 'batches' && selectedBatch) {
                handleBatchClick(selectedBatch);
            } else {
                fetchStudentsWithPagination();
            }
        } catch (err) {
            console.error('Failed to link Wise ID', err);
            alert(err.response?.data?.error || 'Failed to link Wise ID');
        } finally {
            setLoading(false);
        }
    };

    const handleTakeBreak = async (e) => {
        e.preventDefault();
        if (!breakStudentId) return;
        setLoading(true);
        try {
            await api.post(`students/${breakStudentId}/take_break/`, { reason: breakReason, date: breakStartDate || undefined });
            alert("Student placed on break successfully.");
            setIsBreakModalOpen(false);
            setBreakReason('');
            setBreakStudentId(null);
            fetchStudentsWithPagination(); // Refresh list
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.error || "Failed to place student on break.");
        } finally {
            setLoading(false);
        }
    };

    const handleDiscontinue = async (e) => {
        e.preventDefault();
        if (!discontinueStudentId) return;
        setLoading(true);
        try {
            await api.post(`students/${discontinueStudentId}/discontinue/`, { reason: discontinueReason, date: discontinueDate || undefined });
            alert("Student marked as discontinued.");
            setIsDiscontinueModalOpen(false);
            setDiscontinueReason('');
            setDiscontinueStudentId(null);
            fetchStudentsWithPagination(); // Refresh list
            if (viewTab === 'dashboard') fetchBreakMetrics();
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.error || "Failed to mark student as discontinued.");
        } finally {
            setLoading(false);
        }
    };

    const handleRejoin = async (e) => {
        e.preventDefault();
        if (!rejoinStudentId) return;
        setLoading(true);
        try {
            await api.post(`students/${rejoinStudentId}/rejoin/`, { date: rejoinDate || undefined });
            alert("Student rejoined successfully.");
            setIsRejoinModalOpen(false);
            setRejoinStudentId(null);
            fetchStudentsWithPagination(); // Refresh list
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.error || "Failed to rejoin student.");
        } finally {
            setLoading(false);
        }
    };

    const currentMonthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

    return (
        <div className="min-h-screen w-full bg-slate-50 font-sans text-slate-900 pb-10">
            {/* Top Minimal Navigation */}
            <div className="flex flex-col lg:flex-row gap-6 justify-between items-start lg:items-center bg-white px-6 py-5 rounded-2xl border border-slate-200 shadow-sm mb-6">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
                        Mentor Dashboard
                    </h1>
                    <p className="text-slate-500 font-medium text-xs sm:text-sm mt-1">Manage your batches and track student progress.</p>
                </div>

                <div className="flex bg-white border border-slate-200 p-1 rounded-xl w-full lg:w-auto overflow-x-auto scrollbar-none gap-1 shadow-sm">
                    <button
                        onClick={() => { setViewTab('dashboard'); setSelectedBatch(null); }}
                        className={`flex-1 lg:flex-none whitespace-nowrap px-4 sm:px-5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${viewTab === 'dashboard' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Dashboard
                    </button>
                    <button
                        onClick={() => { setViewTab('batches'); setSelectedBatch(null); }}
                        className={`flex-1 lg:flex-none whitespace-nowrap px-4 sm:px-5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${viewTab === 'batches' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Batches
                    </button>
                    <button
                        onClick={() => { setViewTab('all-students'); setSelectedBatch(null); }}
                        className={`flex-1 lg:flex-none whitespace-nowrap px-4 sm:px-5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${viewTab === 'all-students' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Full Student List
                    </button>
                    {authUser?.role === 'ADMIN' || authUser?.role === 'SUPER_ADMIN' ? (
                        <button
                            onClick={() => { setViewTab('wise-courses'); setSelectedBatch(null); setSelectedWiseCourse(null); }}
                            className={`flex-1 lg:flex-none whitespace-nowrap px-4 sm:px-5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${viewTab === 'wise-courses' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Wise LMS Batches
                        </button>
                    ) : null}
                </div>

                {dashboardStats?.has_team && (
                    <div className="w-full lg:w-48">
                        <select
                            value={selectedTeamMentor}
                            onChange={(e) => setSelectedTeamMentor(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                        >
                            <option value="">All Team Data</option>
                            {dashboardStats.team_members?.map(member => (
                                <option key={member.id} value={member.id}>
                                    {member.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {!selectedBatch && viewTab === 'batches' && (authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.MENTOR?.add) && (
                    <button
                        onClick={() => {
                            setNewBatch({ name: '', course: '', start_date: '', end_date: '', secondary_mentors: [] });
                            setIsEditMode(false);
                            setIsCreateModalOpen(true);
                        }}
                        className="w-full lg:w-auto px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-semibold text-xs sm:text-sm text-center shadow-sm"
                    >
                        + Create Batch
                    </button>
                )}
                {selectedBatch && (
                    <button
                        onClick={() => setSelectedBatch(null)}
                        className="w-full lg:w-auto text-slate-500 hover:text-indigo-600 font-semibold flex items-center justify-center gap-2 transition-colors px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm shadow-sm"
                    >
                        <span className="text-lg">←</span> Back
                    </button>
                )}
            </div>

            {/* Content Logic */}
            {viewTab === 'dashboard' && !selectedBatch && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition-all">
                            <div>
                                <p className="text-sm font-semibold text-slate-500 mb-1">Total Batches</p>
                                <p className="text-3xl font-black text-slate-800">{dashboardStats?.batches || batchPagination?.count || batches?.length || 0}</p>
                            </div>
                            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                                <BookOpen size={24} />
                            </div>
                        </div>

                        {/* Date Filter for Break Metrics */}
                        <div className="col-span-1 sm:col-span-2 lg:col-span-4 flex items-center justify-end gap-3 mb-2">
                            <input 
                                type="date" 
                                value={breakStartDate} 
                                onChange={(e) => setBreakStartDate(e.target.value)}
                                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white"
                            />
                            <span className="text-slate-400">to</span>
                            <input 
                                type="date" 
                                value={breakEndDate} 
                                onChange={(e) => setBreakEndDate(e.target.value)}
                                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white"
                            />
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition-all">
                            <div>
                                <p className="text-sm font-semibold text-slate-500 mb-1">Total Students</p>
                                <p className="text-3xl font-black text-slate-800">{dashboardStats?.students || 0}</p>
                            </div>
                            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                                <Users size={24} />
                            </div>
                        </div>

                        <div 
                            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition-all cursor-pointer hover:border-orange-200"
                            onClick={() => {
                                setBreakListModalType('on_break');
                                setIsBreakListModalOpen(true);
                            }}
                        >
                            <div>
                                <p className="text-sm font-semibold text-slate-500 mb-1">Students On Break</p>
                                <p className="text-3xl font-black text-slate-800">{breakMetrics.on_break_count || 0}</p>
                            </div>
                            <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600">
                                <User size={24} />
                            </div>
                        </div>

                        <div 
                            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition-all cursor-pointer hover:border-emerald-200"
                            onClick={() => {
                                setBreakListModalType('rejoined');
                                setIsBreakListModalOpen(true);
                            }}
                        >
                            <div>
                                <p className="text-sm font-semibold text-slate-500 mb-1">Rejoined Students</p>
                                <p className="text-3xl font-black text-slate-800">{breakMetrics.rejoined_count || 0}</p>
                            </div>
                            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                                <Calendar size={24} />
                            </div>
                        </div>

                        <div 
                            onClick={() => {
                                setBreakListModalType('discontinued');
                                setIsBreakListModalOpen(true);
                            }}
                            className="bg-white rounded-3xl p-6 border border-slate-200 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] cursor-pointer hover:shadow-lg transition-all"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-slate-500 mb-1">Discontinued Students</p>
                                    <p className="text-3xl font-black text-slate-800">{breakMetrics.discontinued_count || 0}</p>
                                </div>
                                <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-600">
                                    <UserMinus size={24} />
                                </div>
                            </div>
                        </div>

                        <div 
                            onClick={() => setIsFeeModalOpen(true)}
                            className="bg-white rounded-3xl p-6 border border-slate-200 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] cursor-pointer hover:shadow-lg transition-all hover:border-indigo-200"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-slate-500 mb-1">Due Fees</p>
                                    <p className="text-3xl font-black text-slate-800">
                                        ₹{feeDefaulters.reduce((sum, s) => sum + Number(s.due_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">{feeDefaulters.length} students have unpaid fees</p>
                                </div>
                                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                                    <IndianRupee size={24} />
                                </div>
                            </div>
                        </div>

                        <div 
                            onClick={() => setIsCollectedModalOpen(true)}
                            className="bg-white rounded-3xl p-6 border border-slate-200 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] cursor-pointer hover:shadow-lg transition-all hover:border-emerald-200"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-slate-500 mb-1">Collected Fees</p>
                                    <p className="text-3xl font-black text-slate-800">
                                        ₹{collectedFees.reduce((sum, s) => sum + Number(s.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">{collectedFees.length} successful payments</p>
                                </div>
                                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                                    <IndianRupee size={24} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Batch Fees Breakdown */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-fadeIn">
                        <div className="mb-4">
                            <h3 className="text-lg font-bold text-slate-800">Batch Fees Breakdown (Current Month)</h3>
                            <p className="text-xs text-slate-500 mt-1">Expected, collected, and pending dues per batch for this month.</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-400 font-bold text-xs uppercase tracking-wider">
                                        <th className="p-4">Batch Name</th>
                                        <th className="p-4 text-center">Student Count</th>
                                        <th className="p-4 text-right">Expected Fee</th>
                                        <th className="p-4 text-right">Collected Fee</th>
                                        <th className="p-4 text-right">Pending Dues</th>
                                        <th className="p-4">Collection Progress</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-sm">
                                    {dashboardStats?.batch_fees?.map((b) => {
                                        const progress = b.expected > 0 ? Math.round((b.collected / b.expected) * 100) : 0;
                                        return (
                                            <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="p-4 font-semibold text-slate-800">{b.name}</td>
                                                <td className="p-4 text-center text-slate-600">{b.student_count}</td>
                                                <td className="p-4 text-right font-medium text-slate-700">₹{b.expected?.toLocaleString()}</td>
                                                <td className="p-4 text-right font-bold text-emerald-600">₹{b.collected?.toLocaleString()}</td>
                                                <td className="p-4 text-right font-bold text-amber-600">₹{b.due?.toLocaleString()}</td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden shrink-0">
                                                            <div 
                                                                className="bg-emerald-500 h-full rounded-full shadow-sm" 
                                                                style={{ width: `${Math.min(100, progress)}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-500">{progress}%</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {(!dashboardStats?.batch_fees || dashboardStats.batch_fees.length === 0) && (
                                        <tr>
                                            <td colSpan="6" className="p-8 text-center text-slate-400">
                                                No batch fee statistics available.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 mb-4">Quick Actions</h3>
                            <div className="space-y-3">
                                {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.MENTOR?.add) && (
                                    <button
                                        onClick={() => {
                                            setNewBatch({ name: '', course: '', start_date: '', end_date: '', secondary_mentors: [] });
                                            setIsEditMode(false);
                                            setIsCreateModalOpen(true);
                                        }}
                                        className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-100 transition-all group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-indigo-600 shadow-sm">
                                                <BookOpen size={20} />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-700">Create New Batch</p>
                                                <p className="text-xs text-slate-500">Set up a new academic batch</p>
                                            </div>
                                        </div>
                                        <span className="text-indigo-400 group-hover:text-indigo-600">→</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => setViewTab('all-students')}
                                    className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-blue-50 hover:border-blue-100 transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-blue-600 shadow-sm">
                                            <Users size={20} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-bold text-slate-800 group-hover:text-blue-700">View All Students</p>
                                            <p className="text-xs text-slate-500">Manage student profiles & progress</p>
                                        </div>
                                    </div>
                                    <span className="text-blue-400 group-hover:text-blue-600">→</span>
                                </button>
                                {(authUser?.role === 'ADMIN' || authUser?.role === 'SUPER_ADMIN') && (
                                    <button
                                        onClick={() => setViewTab('wise-courses')}
                                        className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-purple-50 hover:border-purple-100 transition-all group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-purple-600 shadow-sm">
                                                <Calendar size={20} />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-bold text-slate-800 group-hover:text-purple-700">Sync Wise LMS</p>
                                                <p className="text-xs text-slate-500">Import classes from Wise</p>
                                            </div>
                                        </div>
                                        <span className="text-purple-400 group-hover:text-purple-600">→</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 mb-4">Recent Batches</h3>
                            <div className="space-y-3">
                                {batches.slice(0, 4).map(batch => (
                                    <div key={batch.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 cursor-pointer" onClick={() => { setViewTab('batches'); handleBatchClick(batch); }}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm">
                                                {batch.name?.charAt(0) || 'B'}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-800 truncate max-w-[200px]">{batch.name}</p>
                                                <p className="text-xs text-slate-500 truncate max-w-[200px]">{batch.course_name || 'No Course'}</p>
                                            </div>
                                        </div>
                                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase rounded-lg tracking-wider">Active</span>
                                    </div>
                                ))}
                                {(!batches || batches.length === 0) && (
                                    <div className="text-center py-8 text-slate-400 text-sm">No recent batches found</div>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {viewTab === 'all-students' && !selectedBatch ? (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="flex flex-col gap-4 mb-8">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800">All Students</h2>
                                    <p className="text-sm text-slate-500">Showing {allStudents.length} students across all programs</p>
                                </div>
                                <div className="flex gap-3">
                                    <button 
                                        onClick={async () => {
                                            try {
                                                const res = await api.post('integrations/sync-wise-fees/');
                                                if (res.data.stats) {
                                                    alert(`Fee sync completed!\n- Synced Fees: ${res.data.stats.synced} students\n- Auto-Linked: ${res.data.stats.linked || 0} students\n- Errors: ${res.data.stats.errors}`);
                                                } else {
                                                    alert(res.data.message || "Fee sync started in the background. Please wait a minute and refresh the page.");
                                                }
                                                fetchStudentsWithPagination();
                                            } catch (err) {
                                                console.error("Failed to sync Wise fees", err);
                                                alert("Failed to sync Wise fees");
                                            }
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl transition-all font-semibold text-sm border border-indigo-200"
                                    >
                                        <RefreshCw size={16} /> <span className="hidden sm:inline">Sync Wise Fees</span>
                                    </button>
                                    <button 
                                        onClick={handleExportFilteredStudents}
                                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition-all font-semibold text-sm shadow-sm"
                                    >
                                        <Download size={16} /> <span className="hidden sm:inline">Export CSV</span>
                                    </button>
                                </div>
                            </div>
                            
                            <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 w-full p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="flex gap-3 w-full sm:w-auto">
                                    <select
                                        className="flex-1 sm:flex-none px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 font-medium text-slate-700"
                                        value={studentFilterProgram}
                                        onChange={(e) => setStudentFilterProgram(e.target.value)}
                                    >
                                        <option value="">All Programs</option>
                                        {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                    <select
                                        className="flex-1 sm:flex-none px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 font-medium text-slate-700"
                                        value={studentFilterCourse}
                                        onChange={(e) => setStudentFilterCourse(e.target.value)}
                                    >
                                        <option value="">All Courses</option>
                                        {allCourses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <select
                                        className="flex-1 sm:flex-none px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 font-medium text-slate-700"
                                        value={studentFilterStatus}
                                        onChange={(e) => setStudentFilterStatus(e.target.value)}
                                    >
                                        <option value="">All Statuses</option>
                                        <option value="ACTIVE">Active</option>
                                        <option value="ON_BREAK">On Break</option>
                                        <option value="DISCONTINUED">Discontinued</option>
                                    </select>
                                </div>
                                <div className="relative w-full sm:w-72 sm:ml-auto">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search students by name, email, or ID..."
                                        className="w-full pl-9 pr-4 py-2 rounded-lg bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-sm font-medium"
                                        value={studentSearchQuery}
                                        onChange={(e) => setStudentSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>


                        {/* Full Student List - Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto custom-scrollbar">
                            <table className="min-w-[1100px] w-full border-separate border-spacing-y-3">
                                <thead>
                                    <tr className="text-left">
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Student</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Program</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Course & Batch</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Total Fee</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Paid Fee</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Due Date</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Monthly Status</th>
                                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allStudents.map((student) => (
                                        <tr key={student.id} className="group hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-5 bg-white border-y border-l border-slate-100 rounded-l-2xl first:border-l">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm shrink-0">
                                                        {student.first_name?.[0]}{student.last_name?.[0] || ''}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-800 flex items-center gap-2">
                                                            {student.first_name} {student.last_name}
                                                            {student.academic_status === 'ON_BREAK' && (
                                                                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[9px] font-black uppercase rounded-md tracking-widest">On Break</span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-slate-400">{student.crm_student_id}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 bg-white border-y border-slate-100 text-center">
                                                <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase">
                                                    {student.program_name}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5 bg-white border-y border-slate-100 text-center text-sm font-medium">
                                                <div className="flex flex-col items-center gap-0.5">
                                                    <span className="text-slate-800 font-bold">{student.course_name || student.lms_course_names || <span className="text-slate-300 italic text-xs font-normal">No Course</span>}</span>
                                                    <span className="text-xs text-slate-500">{student.batch_name || 'Unassigned Batch'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 bg-white border-y border-slate-100 text-center font-bold text-slate-700">
                                                ₹{student.total_fee || 0}
                                            </td>
                                            <td className="px-6 py-5 bg-white border-y border-slate-100 text-center font-bold text-emerald-600">
                                                ₹{student.paid_fee || 0}
                                            </td>
                                            <td className="px-6 py-5 bg-white border-y border-slate-100 text-center text-sm text-slate-500">
                                                {student.fee_due_date || '-'}
                                            </td>
                                            <td className="px-6 py-5 bg-white border-y border-slate-100 text-center text-sm">
                                                <div className="flex flex-col items-center gap-1">
                                                    {student.monthly_payment_months?.includes(currentMonthStr) ? (
                                                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded border border-emerald-100">
                                                            Paid
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs font-bold rounded border border-slate-200">
                                                            Unpaid
                                                        </span>
                                                    )}
                                                    <div className="flex items-center gap-2">
                                                        {student.monthly_payment_months?.includes(currentMonthStr) ? (
                                                            <button
                                                                onClick={() => handleUnmarkPaid(student)}
                                                                className="text-[10px] font-bold text-red-500 hover:text-red-700 transition-colors uppercase tracking-wider"
                                                            >
                                                                Unmark
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => openMarkPaidModal(student)}
                                                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors uppercase tracking-wider"
                                                            >
                                                                Mark Paid
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => openHistoryModal(student)}
                                                            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-wider flex items-center gap-0.5"
                                                        >
                                                            <History size={10} /> History
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 bg-white border-y border-r border-slate-100 rounded-r-2xl text-right">
                                                <div className="flex justify-end gap-2">
                                                    {student.academic_status === 'ON_BREAK' ? (
                                                        <button
                                                            onClick={() => {
                                                                setRejoinStudentId(student.id);
                                                                setIsRejoinModalOpen(true);
                                                            }}
                                                            className="px-3 py-2 rounded-xl text-xs font-bold transition-all bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100"
                                                        >
                                                            Rejoin
                                                        </button>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => {
                                                                    setBreakStudentId(student.id);
                                                                    setIsBreakModalOpen(true);
                                                                }}
                                                                className="px-3 py-2 rounded-xl text-xs font-bold transition-all bg-orange-50 text-orange-600 border border-orange-100 hover:bg-orange-100"
                                                            >
                                                                Take Break
                                                            </button>
                                                            {student.academic_status !== 'DISCONTINUED' && (
                                                                <button
                                                                    onClick={() => {
                                                                        setDiscontinueStudentId(student.id);
                                                                        setIsDiscontinueModalOpen(true);
                                                                    }}
                                                                    className="px-3 py-2 rounded-xl text-xs font-bold transition-all bg-red-50 text-red-600 border border-red-100 hover:bg-red-100"
                                                                >
                                                                    Discontinue
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                    <button
                                                        onClick={() => handleWiseLinkClick(student)}
                                                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${student.lms_student_id ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-100 text-slate-600'}`}
                                                    >
                                                        {student.lms_student_id ? 'Linked' : 'Link Wise'}
                                                    </button>
                                                    <button
                                                        onClick={() => setSelectedStudentProfile(student)}
                                                        className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition-all shadow-sm"
                                                    >
                                                        View Profile
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {allStudents.length === 0 && (
                                        <tr>
                                            <td colSpan="8" className="text-center py-10 text-slate-400">
                                                No students found matching your search.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Full Student List - Mobile Card View */}
                        <div className="md:hidden space-y-4">
                            {allStudents.map((student) => (
                                <div key={student.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 animate-fadeIn">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm flex-shrink-0">
                                            {student.first_name?.[0]}{student.last_name?.[0] || ''}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-bold text-slate-900 truncate flex items-center gap-2">
                                                {student.first_name} {student.last_name}
                                                {student.academic_status === 'ON_BREAK' && (
                                                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[9px] font-black uppercase rounded-md tracking-widest flex-shrink-0">On Break</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-400 truncate">{student.crm_student_id}</div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-3">
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-0.5">Program</span>
                                            <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[9px] font-black uppercase tracking-tight truncate max-w-full">
                                                {student.program_name}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-0.5">Batch</span>
                                            <span className="text-slate-700 font-medium truncate block">
                                                {student.batch_name || <span className="text-slate-400 italic">Unassigned</span>}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-xs border-t border-slate-100 pt-3">
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-0.5">Total Fee</span>
                                            <span className="text-slate-700 font-bold">₹{student.total_fee || 0}</span>
                                        </div>
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-0.5">Paid Fee</span>
                                            <span className="text-emerald-600 font-bold">₹{student.paid_fee || 0}</span>
                                        </div>
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-0.5">Due Date</span>
                                            <span className="text-slate-500 font-medium">{student.fee_due_date || '-'}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-3">
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-1">Monthly Status</span>
                                            {student.monthly_payment_months?.includes(currentMonthStr) ? (
                                                <span className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded border border-emerald-100">
                                                    Paid
                                                </span>
                                            ) : (
                                                <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 font-bold rounded border border-slate-200">
                                                    Unpaid
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            {student.monthly_payment_months?.includes(currentMonthStr) ? (
                                                <button
                                                    onClick={() => handleUnmarkPaid(student)}
                                                    className="px-2.5 py-1 text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-100 transition-colors"
                                                >
                                                    Unmark
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => openMarkPaidModal(student)}
                                                    className="px-2.5 py-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-100 transition-colors"
                                                >
                                                    Mark Paid
                                                </button>
                                            )}
                                            <button
                                                onClick={() => openHistoryModal(student)}
                                                className="px-2.5 py-1 text-[10px] font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors flex items-center gap-1"
                                            >
                                                <History size={10} /> History
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                                        <button
                                            onClick={() => handleWiseLinkClick(student)}
                                            className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all text-center border ${student.lms_student_id ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                                        >
                                            {student.lms_student_id ? 'Linked' : 'Link Wise'}
                                        </button>
                                        <button
                                            onClick={() => setSelectedStudentProfile(student)}
                                            className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition-all text-center border border-slate-900"
                                        >
                                            View Profile
                                        </button>
                                    </div>
                                    <div className="pt-2">
                                        {student.academic_status === 'ON_BREAK' ? (
                                            <button
                                                onClick={() => {
                                                    setRejoinStudentId(student.id);
                                                    setIsRejoinModalOpen(true);
                                                }}
                                                className="w-full py-2.5 rounded-xl text-xs font-bold transition-all text-center border bg-emerald-50 text-emerald-600 border-emerald-100"
                                            >
                                                Rejoin Student
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    setBreakStudentId(student.id);
                                                    setIsBreakModalOpen(true);
                                                }}
                                                className="w-full py-2.5 rounded-xl text-xs font-bold transition-all text-center border bg-orange-50 text-orange-600 border-orange-100"
                                            >
                                                Put on Break
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {allStudents.length === 0 && (
                                <div className="p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 shadow-sm">
                                    No students found matching your search.
                                </div>
                            )}
                        </div>

                        {/* Pagination Controls */}
                        <div className="mt-8 flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-200">
                            <span className="text-sm text-slate-500 font-medium text-center sm:text-left">
                                Showing <span className="text-slate-900 font-bold">{allStudents.length}</span> of <span className="text-slate-900 font-bold">{studentPagination.count}</span> students
                            </span>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <button
                                    onClick={() => setStudentPage(p => Math.max(1, p - 1))}
                                    disabled={!studentPagination.previous || loading}
                                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all text-center"
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => setStudentPage(p => p + 1)}
                                    disabled={!studentPagination.next || loading}
                                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 shadow-md shadow-indigo-100 disabled:opacity-50 transition-all text-center"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            ) : null}

            {/* Wise Courses View */}
            {viewTab === 'wise-courses' && !selectedWiseCourse && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">Wise LMS Classes</h2>
                                <p className="text-sm text-slate-500">Live classes available in your Wise LMS account</p>
                            </div>
                            <button
                                onClick={syncAllWiseBatches}
                                disabled={loading || wiseCourses.length === 0}
                                className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 shadow-md shadow-indigo-100 disabled:opacity-50 transition-all flex items-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Syncing...
                                    </>
                                ) : (
                                    "Sync All to CRM"
                                )}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {wiseCourses.map(course => (
                                <div key={course._id} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-300 transition-all group">
                                    <h3 className="font-bold text-slate-900 mb-1">{course.name || course.subject}</h3>
                                    <p className="text-xs text-slate-500 mb-4">{course.subject}</p>
                                    <div className="flex justify-between items-center mt-4">
                                        <span className="text-xs font-bold text-indigo-600">{course.studentCount || 0} Students</span>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => fetchWiseParticipants(course._id)}
                                                className="px-3 py-1.5 bg-white text-indigo-600 border border-indigo-100 rounded-lg text-xs font-bold hover:bg-indigo-50"
                                            >
                                                View
                                            </button>
                                            <button 
                                                onClick={() => syncWiseBatch(course._id)}
                                                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm"
                                            >
                                                Sync to CRM
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}

            {viewTab === 'wise-courses' && selectedWiseCourse && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <button onClick={() => setSelectedWiseCourse(null)} className="text-indigo-600 text-sm font-bold flex items-center gap-1">
                                ← Back to List
                            </button>
                            <button 
                                onClick={() => syncWiseBatch(selectedWiseCourse._id)}
                                className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700"
                            >
                                Sync this Batch to CRM
                            </button>
                        </div>

                        <h2 className="text-2xl font-bold text-slate-900 mb-2">{selectedWiseCourse.name}</h2>
                        <p className="text-slate-500 mb-6 font-medium">Participants in Wise LMS</p>

                        {/* Participants - Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full">
                                <thead className="text-left border-b border-slate-100">
                                    <tr>
                                        <th className="pb-4 text-xs font-bold text-slate-400 uppercase">Student Name</th>
                                        <th className="pb-4 text-xs font-bold text-slate-400 uppercase">Phone</th>
                                        <th className="pb-4 text-xs font-bold text-slate-400 uppercase">Email</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {wiseParticipants.map(wp => (
                                        <tr key={wp._id || wp.id} className="border-b border-slate-50 last:border-0">
                                            <td className="py-4 font-bold text-slate-800">{wp.name}</td>
                                            <td className="py-4 text-slate-600">{wp.phoneNumber}</td>
                                            <td className="py-4 text-slate-500">{wp.email}</td>
                                        </tr>
                                    ))}
                                    {wiseParticipants.length === 0 && (
                                        <tr><td colSpan="3" className="py-10 text-center text-slate-400">No participants found in this Wise class.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Participants - Mobile Card View */}
                        <div className="md:hidden space-y-3">
                            {wiseParticipants.map(wp => (
                                <div key={wp._id || wp.id} className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-2">
                                    <div className="font-bold text-slate-800">{wp.name}</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-0.5">Phone</span>
                                            <span className="text-slate-600 font-medium">{wp.phoneNumber || 'N/A'}</span>
                                        </div>
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-0.5">Email</span>
                                            <span className="text-slate-600 font-medium truncate block">{wp.email || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {wiseParticipants.length === 0 && (
                                <div className="py-8 text-center text-slate-400">No participants found in this Wise class.</div>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}

            {viewTab === 'batches' && (
                !selectedBatch ? (
                    <div className="space-y-6">
                        <div className="relative w-full md:w-80">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search batches..."
                                className="w-full pl-10 pr-4 py-2 rounded-xl bg-white shadow-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-xs font-medium text-slate-700 placeholder:text-slate-400"
                                value={batchSearchQuery}
                                onChange={(e) => setBatchSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {batches.map(batch => (
                                <motion.div
                                    whileHover={{ y: -4 }}
                                    key={batch.id}
                                    onClick={() => handleBatchClick(batch)}
                                    className="p-6 bg-white rounded-2xl border border-slate-200 cursor-pointer shadow-sm hover:shadow-md transition-all group"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{batch.name}</h3>
                                        <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
                                            Active
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 text-xs pt-4 border-t border-slate-100">
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-0.5 uppercase tracking-wider text-[10px]">Course / Subject</span>
                                            <span className="text-slate-700 font-medium truncate block" title={`${batch.course_name} (${batch.sub_program_name})`}>
                                                {batch.course_name || 'N/A'} {batch.sub_program_name ? <span className="text-slate-400 font-normal text-[10px]">({batch.sub_program_name})</span> : ''}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-0.5 uppercase tracking-wider text-[10px]">Students</span>
                                            <span className="text-slate-700 font-medium block">
                                                {batch.student_count || 0}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-0.5 uppercase tracking-wider text-[10px]">Primary Mentor</span>
                                            <span className="text-slate-700 font-medium truncate block" title={batch.primary_mentor_details?.username}>
                                                {batch.primary_mentor_details?.username || 'None'}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-0.5 uppercase tracking-wider text-[10px]">Teacher</span>
                                            <span className="text-indigo-600 font-bold truncate block" title={batch.teacher_details ? `@${batch.teacher_details.username}` : 'Not Assigned'}>
                                                {batch.teacher_details ? `${batch.teacher_details.first_name || ''} ${batch.teacher_details.last_name || ''}`.trim() || batch.teacher_details.username : 'Not Assigned'}
                                            </span>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}

                            {/* Batch Pagination */}
                            <div className="col-span-full mt-4 flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                <span className="text-sm text-slate-500 font-medium text-center sm:text-left">
                                    Showing <span className="text-slate-900 font-bold">{batches.length}</span> of <span className="text-slate-900 font-bold">{batchPagination.count}</span> batches
                                </span>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <button
                                        onClick={() => setBatchPage(p => Math.max(1, p - 1))}
                                        disabled={!batchPagination.previous}
                                        className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-all text-center"
                                    >
                                        Previous
                                    </button>
                                    <button
                                        onClick={() => setBatchPage(p => p + 1)}
                                        disabled={!batchPagination.next}
                                        className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 transition-all text-center"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                            {batches.length === 0 && (
                                <div className="col-span-full bg-white border border-slate-200 rounded-2xl shadow-sm p-12 sm:p-16 flex flex-col items-center justify-center text-center animate-fadeIn">
                                    <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4 shadow-inner">
                                        <BookOpen size={28} />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-800 mb-1">No Batches Found</h3>
                                    <p className="text-sm text-slate-500 max-w-sm">
                                        There are no active batches at the moment. Create a new batch to get started.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 animate-fadeIn">
                        {/* Batch Details Header */}
                        <div className="p-4 sm:p-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
                            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
                                <div>
                                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">{selectedBatch.name}</h2>
                                    <p className="text-slate-500 text-sm sm:text-lg">{selectedBatch.course_name} {selectedBatch.sub_program_name ? `(${selectedBatch.sub_program_name})` : ''}</p>
                                </div>
                                <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                                    {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.MENTOR?.add) && (
                                        <button
                                            onClick={openAddStudentModal}
                                            className="flex-1 lg:flex-none justify-center px-4 py-2.5 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2"
                                        >
                                            <span className="text-base sm:text-lg">+</span> Add Student
                                        </button>
                                    )}
                                    {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.MENTOR?.edit) && (
                                        <button
                                            onClick={handleEditBatch}
                                            className="flex-1 lg:flex-none justify-center px-4 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2"
                                        >
                                            <Edit size={16} /> Edit Batch
                                        </button>
                                    )}
                                    {(authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN') && (
                                        <button
                                            onClick={() => setIsReassignBatchModalOpen(true)}
                                            className="flex-1 lg:flex-none justify-center px-4 py-2.5 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2"
                                        >
                                            <RefreshCw size={16} /> Reassign Batch
                                        </button>
                                    )}
                                    <button
                                        onClick={handleViewBatchHistory}
                                        className="flex-1 lg:flex-none justify-center px-4 py-2.5 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2"
                                    >
                                        <History size={16} /> View History
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 pt-6 border-t border-slate-100">
                                <div>
                                    <span className="block text-slate-400 text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1">Start Date</span>
                                    <span className="text-slate-900 text-sm sm:text-base font-medium">{selectedBatch.start_date}</span>
                                </div>
                                <div>
                                    <span className="block text-slate-400 text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1">Total Students</span>
                                    <span className="text-slate-900 text-sm sm:text-base font-medium">{studentsInBatch.length}</span>
                                </div>
                                <div className="border-t sm:border-t-0 sm:border-l border-slate-200 pt-4 sm:pt-0 sm:pl-8">
                                    <span className="block text-slate-400 text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-1">Assigned Teacher</span>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-xs sm:text-sm font-bold ${selectedBatch.teacher_details ? 'text-indigo-600' : 'text-slate-400 italic'}`}>
                                            {selectedBatch.teacher_details ? `${selectedBatch.teacher_details.first_name || ''} ${selectedBatch.teacher_details.last_name || ''} (@${selectedBatch.teacher_details.username})` : 'Not Assigned'}
                                        </span>
                                        {(authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN' || authUser?.role === 'MENTOR' || selectedBatch.primary_mentor === authUser?.id || selectedBatch.secondary_mentors?.includes(authUser?.id) || authUser?.permissions?.MENTOR?.edit) && (
                                            <button 
                                                onClick={() => setIsAssignTeacherModalOpen(true)}
                                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-widest border-b border-indigo-200"
                                            >
                                                Edit
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Student List - Desktop Table View */}
                        <div className="hidden md:block bg-white rounded-2xl overflow-x-auto border border-slate-200 shadow-sm custom-scrollbar">
                            <table className="min-w-[1000px] w-full text-left">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="p-5 font-semibold text-slate-505 text-sm">Student Name</th>
                                        <th className="p-5 font-semibold text-slate-500 text-sm">Email</th>
                                        <th className="p-5 font-semibold text-slate-500 text-sm">Mobile</th>
                                        <th className="p-5 font-semibold text-slate-500 text-sm text-center">Total Fee</th>
                                        <th className="p-5 font-semibold text-slate-500 text-sm text-center">Paid Fee</th>
                                        <th className="p-5 font-semibold text-slate-500 text-sm text-center">Due Date</th>
                                        <th className="p-5 font-semibold text-slate-500 text-sm text-center">Monthly Status</th>
                                        <th className="p-5 font-semibold text-slate-500 text-sm text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {studentsInBatch.map((student, idx) => (
                                        <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="p-5">
                                                <div className="font-medium text-slate-900">{student.first_name} {student.last_name}</div>
                                            </td>
                                            <td className="p-5 text-slate-500">{student.email}</td>
                                            <td className="p-5 text-slate-500">{student.mobile}</td>
                                            <td className="p-5 text-center font-bold text-slate-700">₹{student.total_fee || 0}</td>
                                            <td className="p-5 text-center font-bold text-emerald-600">₹{student.paid_fee || 0}</td>
                                            <td className="p-5 text-center text-sm text-slate-500">{student.fee_due_date || '-'}</td>
                                            <td className="p-5 text-center text-sm">
                                                <div className="flex flex-col items-center gap-1">
                                                    {student.monthly_payment_months?.includes(currentMonthStr) ? (
                                                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded border border-emerald-100 animate-fadeIn">
                                                            Paid
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs font-bold rounded border border-slate-200 animate-fadeIn">
                                                            Unpaid
                                                        </span>
                                                    )}
                                                    <div className="flex items-center gap-2">
                                                        {student.monthly_payment_months?.includes(currentMonthStr) ? (
                                                            <button
                                                                onClick={() => handleUnmarkPaid(student)}
                                                                className="text-[10px] font-bold text-red-500 hover:text-red-700 transition-colors uppercase tracking-wider"
                                                            >
                                                                Unmark
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => openMarkPaidModal(student)}
                                                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors uppercase tracking-wider"
                                                            >
                                                                Mark Paid
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => openHistoryModal(student)}
                                                            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-wider flex items-center gap-0.5"
                                                        >
                                                            <History size={10} /> History
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-5 text-right flex items-center justify-end gap-3">
                                                {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.MENTOR?.edit) && (
                                                    <button
                                                        onClick={() => handleWiseLinkClick(student)}
                                                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${student.lms_student_id ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-600'}`}
                                                    >
                                                        {student.lms_student_id ? 'Linked' : 'Link Wise'}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setSelectedStudentProfile(student)}
                                                    className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-2"
                                                >
                                                    <FileText size={14} />
                                                    Profile
                                                </button>
                                                {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.MENTOR?.edit) && (
                                                    <button
                                                        onClick={() => {
                                                            setCredentialStudent(student);
                                                            setCredentialForm({ username: student.username || '', password: '' });
                                                            setIsCredentialsModalOpen(true);
                                                        }}
                                                        className="px-4 py-2 bg-amber-50 text-amber-600 rounded-xl text-xs font-bold hover:bg-amber-100 transition-all flex items-center gap-2"
                                                    >
                                                        <Key size={14} />
                                                        Set Login
                                                    </button>
                                                )}
                                                {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.MENTOR?.delete) && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); removeStudentFromBatch(student.id); }}
                                                        className="text-red-500 hover:text-red-700 text-sm font-medium px-4 py-2 rounded-xl hover:bg-red-50 transition-colors"
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {studentsInBatch.length === 0 && (
                                        <tr>
                                            <td colSpan="8" className="p-12 text-center text-slate-400">
                                                No students assigned to this batch yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Student List - Mobile Card View */}
                        <div className="md:hidden space-y-4">
                            {studentsInBatch.map((student) => (
                                <div key={student.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm flex-shrink-0">
                                            {student.first_name?.[0]}{student.last_name?.[0] || ''}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-bold text-slate-900 truncate">{student.first_name} {student.last_name}</div>
                                            <div className="text-xs text-slate-400 truncate">{student.email}</div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-3">
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-0.5">Mobile</span>
                                            <span className="text-slate-700 font-medium">{student.mobile || 'N/A'}</span>
                                        </div>
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-0.5">Wise ID Status</span>
                                            <span className={`font-bold ${student.lms_student_id ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                {student.lms_student_id ? 'Linked' : 'Not Linked'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-xs border-t border-slate-100 pt-3">
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-0.5">Total Fee</span>
                                            <span className="text-slate-700 font-bold">₹{student.total_fee || 0}</span>
                                        </div>
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-0.5">Paid Fee</span>
                                            <span className="text-emerald-600 font-bold">₹{student.paid_fee || 0}</span>
                                        </div>
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-0.5">Due Date</span>
                                            <span className="text-slate-500 font-medium">{student.fee_due_date || '-'}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-3">
                                        <div>
                                            <span className="block text-slate-400 font-semibold mb-1">Monthly Status</span>
                                            {student.monthly_payment_months?.includes(currentMonthStr) ? (
                                                <span className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded border border-emerald-100">
                                                    Paid
                                                </span>
                                            ) : (
                                                <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 font-bold rounded border border-slate-200">
                                                    Unpaid
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            {student.monthly_payment_months?.includes(currentMonthStr) ? (
                                                <button
                                                    onClick={() => handleUnmarkPaid(student)}
                                                    className="px-2.5 py-1 text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-100 transition-colors"
                                                >
                                                    Unmark
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => openMarkPaidModal(student)}
                                                    className="px-2.5 py-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-100 transition-colors"
                                                >
                                                    Mark Paid
                                                </button>
                                            )}
                                            <button
                                                onClick={() => openHistoryModal(student)}
                                                className="px-2.5 py-1 text-[10px] font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors flex items-center gap-1"
                                            >
                                                <History size={10} /> History
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
                                        <div className="grid grid-cols-2 gap-2">
                                            {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.MENTOR?.edit) && (
                                                <button
                                                    onClick={() => handleWiseLinkClick(student)}
                                                    className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all text-center border ${student.lms_student_id ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                                                >
                                                    {student.lms_student_id ? 'Linked' : 'Link Wise'}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setSelectedStudentProfile(student)}
                                                className="w-full py-2.5 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all flex items-center justify-center gap-1.5 border border-indigo-100"
                                            >
                                                <FileText size={14} />
                                                Profile
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.MENTOR?.edit) && (
                                                <button
                                                    onClick={() => {
                                                        setCredentialStudent(student);
                                                        setCredentialForm({ username: student.username || '', password: '' });
                                                        setIsCredentialsModalOpen(true);
                                                    }}
                                                    className="w-full py-2.5 bg-amber-50 text-amber-600 rounded-xl text-xs font-bold hover:bg-amber-100 transition-all flex items-center justify-center gap-1.5 border border-amber-100"
                                                >
                                                    <Key size={14} />
                                                    Set Login
                                                </button>
                                            )}
                                            {(authUser?.role === 'SUPER_ADMIN' || authUser?.permissions?.MENTOR?.delete) && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeStudentFromBatch(student.id); }}
                                                    className="w-full py-2.5 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 transition-all text-center border border-red-100"
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {studentsInBatch.length === 0 && (
                                <div className="p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 shadow-sm">
                                    No students assigned to this batch yet.
                                </div>
                            )}
                        </div>
                    </div>
                )
            )}

            {/* Create Batch Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-2xl p-5 sm:p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
                    >
                        <h2 className="text-2xl font-bold mb-6 text-slate-900">{isEditMode ? 'Edit Batch' : 'Create New Batch'}</h2>
                        <form onSubmit={handleSaveBatch} className="space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Batch Name</label>
                                <input
                                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                    value={newBatch.name}
                                    onChange={e => setNewBatch({ ...newBatch, name: e.target.value })}
                                    required
                                    placeholder="e.g., Summer 2026 Batch A"
                                />
                            </div>
                            {isEditMode ? (
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Program & Course</label>
                                    <div className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 font-medium">
                                        {selectedBatch?.course_name || 'Loading...'}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">Course details cannot be changed for an active batch.</p>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Program</label>
                                        <select
                                            className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                            value={selectedProgramId}
                                            onChange={e => setSelectedProgramId(e.target.value)}
                                            required={!isEditMode}
                                            disabled={isEditMode}
                                        >
                                            <option value="">Select Program</option>
                                            {programs.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                        {isEditMode && <p className="text-xs text-slate-400 mt-1">Course selection cannot be changed while editing.</p>}
                                    </div>

                                    {(selectedProgramId || isEditMode) && (
                                        <div className="animate-fadeIn">
                                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Sub-Program / Category</label>
                                            <select
                                                className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                                value={selectedSubProgramId}
                                                onChange={e => setSelectedSubProgramId(e.target.value)}
                                                required={!isEditMode}
                                                disabled={isEditMode}
                                            >
                                                <option value="">Select Category</option>
                                                {subPrograms.map(sp => (
                                                    <option key={sp.id} value={sp.id}>{sp.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Course</label>
                                        <select
                                            className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                            value={newBatch.course}
                                            onChange={e => setNewBatch({ ...newBatch, course: e.target.value })}
                                            required
                                            disabled={(!selectedSubProgramId && subPrograms.length > 0) || isEditMode}
                                        >
                                            <option value="">Select Course</option>
                                            {courses.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Start Date</label>
                                    <input
                                        type="date"
                                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                        value={newBatch.start_date}
                                        onChange={e => setNewBatch({ ...newBatch, start_date: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">End Date</label>
                                    <input
                                        type="date"
                                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                                        value={newBatch.end_date}
                                        onChange={e => setNewBatch({ ...newBatch, end_date: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Secondary Mentors (Optional)</label>
                                <div className="p-3 border border-slate-200 rounded-xl bg-slate-50 max-h-40 overflow-y-auto custom-scrollbar">
                                    <div className="space-y-2">
                                        {mentors.filter(m => m.id !== authUser?.id && m.role === 'MENTOR').map(mentor => (
                                            <label key={mentor.id} className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors group relative overflow-hidden">
                                                <input
                                                    type="checkbox"
                                                    value={mentor.id}
                                                    checked={newBatch.secondary_mentors.includes(mentor.id)}
                                                    onChange={(e) => {
                                                        const id = parseInt(e.target.value);
                                                        if (e.target.checked) {
                                                            setNewBatch({ ...newBatch, secondary_mentors: [...newBatch.secondary_mentors, id] });
                                                        } else {
                                                            setNewBatch({ ...newBatch, secondary_mentors: newBatch.secondary_mentors.filter(mId => mId !== id) });
                                                        }
                                                    }}
                                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 transition-shadow"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <span className="block text-sm font-semibold text-slate-700 group-hover:text-indigo-700 transition-colors truncate">
                                                        {mentor.first_name || mentor.last_name ? `${mentor.first_name || ''} ${mentor.last_name || ''}`.trim() : mentor.username}
                                                    </span>
                                                    <span className="block text-xs text-slate-500 truncate">{mentor.email || `@${mentor.username}`}</span>
                                                </div>
                                            </label>
                                        ))}
                                        {mentors.filter(m => m.id !== authUser?.id && m.role === 'MENTOR').length === 0 && (
                                            <p className="text-sm text-slate-400 text-center py-2">No other mentors available</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => { setIsCreateModalOpen(false); setIsEditMode(false); }} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition-colors">Cancel</button>
                                <button type="submit" className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all">
                                    {isEditMode ? 'Update Batch' : 'Create Batch'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {/* Add Student Modal */}
            {isAddStudentModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-lg shadow-2xl h-[80vh] max-h-[90vh] flex flex-col"
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-slate-800">Add Student to Batch</h2>
                            <button onClick={() => setIsAddStudentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="mb-6">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Search by name, ID or mobile..."
                                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                                    value={unassignedSearchQuery}
                                    onChange={(e) => setUnassignedSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        {selectedUnassignedStudents.length > 0 && (
                            <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-between animate-fadeIn">
                                <span className="text-sm font-bold text-indigo-700">{selectedUnassignedStudents.length} students selected</span>
                                <button 
                                    onClick={bulkAddStudents}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200"
                                >
                                    Add All Selected
                                </button>
                            </div>
                        )}

                        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                            {unassignedStudents.length === 0 ? (
                                <p className="text-center py-10 text-slate-400">No unassigned students found.</p>
                            ) : (
                                unassignedStudents.map(student => (
                                    <div key={student.id} className={`flex items-center justify-between p-3 sm:p-4 bg-slate-50 rounded-2xl border transition-all ${selectedUnassignedStudents.includes(student.id) ? 'border-indigo-400 bg-indigo-50/30' : 'border-slate-100'}`}>
                                        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                                            <input 
                                                type="checkbox" 
                                                className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                                                checked={selectedUnassignedStudents.includes(student.id)}
                                                onChange={() => toggleStudentSelection(student.id)}
                                            />
                                            <div className="min-w-0">
                                                <p className="font-bold text-slate-900 leading-none mb-1 truncate">{student.first_name} {student.last_name}</p>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter truncate">{student.crm_student_id}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => addStudentToBatch(student.id)}
                                            className="px-4 py-2 bg-white text-indigo-600 border border-indigo-100 rounded-lg hover:bg-indigo-50 text-xs font-bold transition-colors flex-shrink-0"
                                        >
                                            Add
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Pagination for Modal */}
                        {unassignedPagination.count > 0 && (
                            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100 mt-4">
                                <span className="text-xs text-slate-500 font-medium">
                                    Total: <b>{unassignedPagination.count}</b> (Page {unassignedPage})
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setUnassignedPage(p => Math.max(1, p - 1))}
                                        disabled={!unassignedPagination.previous || loading}
                                        className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold disabled:opacity-50"
                                    >
                                        Prev
                                    </button>
                                    <button
                                        onClick={() => setUnassignedPage(p => p + 1)}
                                        disabled={!unassignedPagination.next || loading}
                                        className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold disabled:opacity-50"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="pt-6 mt-2 border-t border-slate-100">
                            <button onClick={() => setIsAddStudentModalOpen(false)} className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors">Close</button>
                        </div>
                    </motion.div>
                </div>
            )}
             
             {/* Assign Teacher Modal */}
             {isAssignTeacherModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-fadeIn">
                    <motion.div 
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-3xl p-5 sm:p-8 w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar"
                    >
                        <h2 className="text-2xl font-bold mb-6 text-slate-800">Assign Teacher</h2>
                        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                            {teachers.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => handleAssignTeacher(selectedBatch.id, t.id)}
                                    className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between group transition-all ${selectedBatch.teacher === t.id ? 'border-indigo-600 bg-indigo-50 shadow-sm shadow-indigo-50' : 'border-slate-100 hover:border-indigo-200 hover:bg-slate-50'}`}
                                >
                                    <div>
                                        <div className="font-bold text-slate-900 leading-tight mb-0.5">{t.first_name || t.username} {t.last_name || ''}</div>
                                        <div className="text-xs text-slate-400 font-medium">@{t.username}</div>
                                    </div>
                                    {selectedBatch.teacher === t.id && (
                                        <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
                                        </div>
                                    )}
                                </button>
                            ))}
                            {teachers.length === 0 && (
                                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                    <p className="text-slate-400 font-medium italic">No teachers found in system.</p>
                                </div>
                            )}
                        </div>
                        <button onClick={() => setIsAssignTeacherModalOpen(false)} className="w-full mt-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-colors">Close</button>
                    </motion.div>
                </div>
            )}

            {/* Student Profile Modal */}
            {selectedStudentProfile && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-3xl p-5 sm:p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
                    >
                        <div className="flex justify-between items-start mb-6 sm:mb-8">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-indigo-100">
                                    {(selectedStudentProfile.first_name?.[0] || '')}{(selectedStudentProfile.last_name?.[0] || '')}
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-900">{selectedStudentProfile.first_name} {selectedStudentProfile.last_name}</h2>
                                    <p className="text-slate-500 font-medium">{selectedStudentProfile.crm_student_id}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedStudentProfile(null)}
                                className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Enrollment Details */}
                            <div className="md:col-span-2 bg-slate-50 p-5 sm:p-6 rounded-2xl border border-slate-100">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Enrollment Details</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Program</p>
                                        <p className="font-bold text-slate-800">{selectedStudentProfile.program_name}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Sub-Program</p>
                                        <p className="font-bold text-slate-800">{selectedStudentProfile.sub_program_name || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Course (CRM)</p>
                                        <p className="font-bold text-slate-800">{selectedStudentProfile.course_name || '-'}</p>
                                    </div>
                                    {studentLmsData?.enrolled_courses?.length > 0 && (
                                        <div className="col-span-1 sm:col-span-2 md:col-span-1">
                                            <p className="text-xs text-slate-500 mb-1">Wise LMS Courses</p>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {studentLmsData.enrolled_courses.map(course => (
                                                    <span key={course.id} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold">
                                                        {course.name || 'Unknown Course'}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* LMS / Finance info */}
                            <div className="md:col-span-2 bg-gradient-to-br from-slate-900 to-indigo-950 p-5 sm:p-7 rounded-3xl text-white shadow-xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                                    <Key size={120} />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-300">Wise LMS Integration</h3>
                                        <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-white/60">Live Feed</span>
                                    </div>

                                    {studentLmsData ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
                                            <div className="space-y-4">
                                                <div>
                                                    <p className="text-xs text-indigo-300/60 font-bold uppercase mb-1">Total Fee</p>
                                                    <p className="text-2xl font-black">₹{studentLmsData.fee_details?.total_fee?.toLocaleString()}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-indigo-300/60 font-bold uppercase mb-1">Due Amount</p>
                                                    <p className={`text-xl font-bold ${studentLmsData.fee_details?.due_fee > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                        ₹{studentLmsData.fee_details?.due_fee?.toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div>
                                                    <p className="text-xs text-indigo-300/60 font-bold uppercase mb-1">Attendance</p>
                                                    <div className="flex items-end gap-2">
                                                        <p className="text-3xl font-black text-white">{studentLmsData.attendance}%</p>
                                                        <p className="text-[10px] text-white/40 mb-1">Monthly</p>
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-indigo-300/60 font-bold uppercase mb-1">Next Due Date</p>
                                                    <p className="text-sm font-bold text-white/80">{studentLmsData.fee_details?.next_due_date || 'N/A'}</p>
                                                </div>
                                            </div>

                                            <div className="sm:col-span-2 md:col-span-1">
                                                <p className="text-xs text-indigo-300/60 font-bold uppercase mb-3">Course Progress</p>
                                                <div className="text-4xl font-black text-indigo-400 mb-2">{studentLmsData.course_progress}%</div>
                                                <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                                                    <div
                                                        className="bg-indigo-400 h-full rounded-full transition-all duration-1000"
                                                        style={{ width: `${studentLmsData.course_progress}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="py-6 text-center text-white/40 text-sm italic font-medium">
                                            {selectedStudentProfile.lms_student_id ? "Connecting to Wise LMS..." : "No Wise ID linked to this student."}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Contact Info */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Contact Info</h3>
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Mobile</p>
                                        <p className="font-medium text-slate-800 break-all">{selectedStudentProfile.mobile || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Email</p>
                                        <p className="font-medium text-slate-800 break-all">{selectedStudentProfile.email || '-'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Dynamic Fields */}
                            <div className="md:col-span-2">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Application Form Details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white border border-slate-100 p-5 sm:p-6 rounded-2xl">
                                    {selectedStudentProfile.dynamic_values_list?.length > 0 ? (
                                        selectedStudentProfile.dynamic_values_list.map((val) => (
                                            <div key={val.id}>
                                                <p className="text-xs text-slate-500 mb-1">{val.field_label}</p>
                                                <p className="font-medium text-slate-800 break-words">{val.value || '-'}</p>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-slate-400 text-sm italic col-span-1 md:col-span-2">No custom fields filled.</p>
                                    )}
                                </div>
                            </div>

                            {/* Documents */}
                            <div className="md:col-span-2">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Uploaded Documents</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {selectedStudentProfile.documents_list?.length > 0 ? (
                                        selectedStudentProfile.documents_list.map((doc) => (
                                            <a
                                                key={doc.id}
                                                href={`${api.defaults.baseURL.replace('/api/', '')}${doc.file}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-all group"
                                            >
                                                <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-slate-400 group-hover:text-indigo-600 shadow-sm">
                                                    <FileText size={20} />
                                                </div>
                                                <div className="flex-1 overflow-hidden">
                                                    <p className="text-sm font-bold text-slate-800 truncate">{doc.document_type}</p>
                                                    <p className="text-xs text-slate-400">Click to view</p>
                                                </div>
                                            </a>
                                        ))
                                    ) : (
                                        <p className="text-slate-400 text-sm italic">No documents uploaded.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-10 pt-8 border-t border-slate-100">
                            <button
                                onClick={() => setSelectedStudentProfile(null)}
                                className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                            >
                                Close Profile
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
            {/* Credentials Modal */}
            {isCredentialsModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-2xl p-5 sm:p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
                    >
                        <h2 className="text-xl font-bold mb-2 text-slate-900 flex items-center gap-2">
                            <Key className="text-amber-500" size={24} />
                            Set Student Login
                        </h2>
                        <p className="text-sm text-slate-500 mb-6">Set username and password for <b>{credentialStudent?.first_name} {credentialStudent?.last_name}</b></p>

                        <form onSubmit={handleSetCredentials} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Username</label>
                                <input
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none transition-all text-sm"
                                    value={credentialForm.username}
                                    onChange={e => setCredentialForm({ ...credentialForm, username: e.target.value })}
                                    required
                                    placeholder="Username"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Password</label>
                                <input
                                    type="password"
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none transition-all text-sm"
                                    value={credentialForm.password}
                                    onChange={e => setCredentialForm({ ...credentialForm, password: e.target.value })}
                                    required
                                    placeholder="Enter new password"
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsCredentialsModalOpen(false)}
                                    className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold shadow-lg shadow-amber-100 hover:shadow-amber-200 transition-all disabled:opacity-50"
                                >
                                    {loading ? "Updating..." : "Save Credentials"}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {/* Wise ID Linking Modal */}
            {isWiseLinkModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-3xl p-5 sm:p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
                    >
                        <h2 className="text-xl font-bold mb-2 text-slate-900 flex items-center gap-2">
                            🔗 Link Wise LMS ID
                        </h2>
                        <p className="text-sm text-slate-500 mb-6">
                            Manually enter the Wise User UUID for <b>{wiseLinkStudent?.first_name}</b>.
                            <br />
                            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded mt-1 inline-block">
                                ⚠️ Only use this if Auto-Link fails.
                            </span>
                        </p>

                        <form onSubmit={handleSaveWiseId} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Wise User ID (UUID)</label>
                                <input
                                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none transition-all font-mono text-sm"
                                    value={wiseIdInput}
                                    onChange={e => setWiseIdInput(e.target.value)}
                                    placeholder="e.g. 66a1b2c3d4e5f6..."
                                    required
                                />
                                <p className="text-xs text-slate-400 mt-2">
                                    Find this in Wise Dashboard &gt; Users &gt; Select User &gt; URL or ID field.
                                </p>
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsWiseLinkModalOpen(false)}
                                    className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-indigo-600 transition-all shadow-lg disabled:opacity-50"
                                >
                                    {loading ? "Linking..." : "Link ID"}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
            {/* Wise ID Linking Modal */}
            {/* Wise Link Modal Removed - Using Auto-Link Alert/Confirm flow for now */}

            {/* Take Break Modal */}
            {isBreakModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-fadeIn">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100">
                            <h2 className="text-lg font-bold text-slate-800">Put Student on Break</h2>
                            <button onClick={() => setIsBreakModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-all">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleTakeBreak} className="p-6">
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Reason for Break</label>
                                <textarea
                                    value={breakReason}
                                    onChange={(e) => setBreakReason(e.target.value)}
                                    placeholder="Enter reason for academic break..."
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all resize-none h-32 text-sm"
                                    required
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Break Start Date</label>
                                <input
                                    type="date"
                                    value={breakStartDate}
                                    onChange={(e) => setBreakStartDate(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-sm"
                                    required
                                />
                            </div>
                            <div className="flex gap-3 justify-end mt-6">
                                <button type="button" onClick={() => setIsBreakModalOpen(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">Cancel</button>
                                <button type="submit" disabled={loading} className="px-5 py-2.5 text-sm font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl transition-all shadow-md shadow-orange-200 flex items-center gap-2">
                                    {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : 'Confirm Break'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Discontinue Modal */}
            {isDiscontinueModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-fadeIn">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100">
                            <h2 className="text-lg font-bold text-slate-800">Mark Student as Discontinued</h2>
                            <button onClick={() => setIsDiscontinueModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-all">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleDiscontinue} className="p-6">
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Reason for Discontinuation</label>
                                <textarea
                                    value={discontinueReason}
                                    onChange={(e) => setDiscontinueReason(e.target.value)}
                                    placeholder="Enter reason for discontinuing..."
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400 transition-all resize-none h-32 text-sm"
                                    required
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Discontinue Date</label>
                                <input
                                    type="date"
                                    value={discontinueDate}
                                    onChange={(e) => setDiscontinueDate(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-sm"
                                    required
                                />
                            </div>
                            <div className="flex gap-3 justify-end mt-6">
                                <button type="button" onClick={() => setIsDiscontinueModalOpen(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">Cancel</button>
                                <button type="submit" disabled={loading} className="px-5 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-md shadow-red-200 flex items-center gap-2">
                                    {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : 'Confirm'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Break / Rejoin List Modal */}
            {isBreakListModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[90]">
                    <div className="bg-white rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl animate-fadeIn max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">
                                    {breakListModalType === 'on_break' ? 'Students On Break' : (breakListModalType === 'rejoined' ? 'Rejoined Students' : 'Discontinued Students')}
                                </h2>
                                <p className="text-sm text-slate-500 mt-1">
                                    {breakStartDate && breakEndDate ? `Showing records from ${breakStartDate} to ${breakEndDate}` : 'Showing all records for the selected period'}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={handleExportBreakList} 
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 font-bold text-sm rounded-xl hover:bg-indigo-100 transition-all"
                                >
                                    Export CSV
                                </button>
                                <button onClick={() => setIsBreakListModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-all">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar bg-slate-50/50">
                            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center gap-3">
                                    <div className="relative flex-1 w-full sm:max-w-sm">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input 
                                            type="text"
                                            placeholder="Search by name, ID or reason..."
                                            value={modalSearchQuery}
                                            onChange={(e) => setModalSearchQuery(e.target.value)}
                                            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-sm"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                        <input
                                            type="date"
                                            value={modalStartDate}
                                            onChange={(e) => setModalStartDate(e.target.value)}
                                            className="px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-sm w-full sm:w-auto text-slate-600"
                                            title="Start Date"
                                        />
                                        <span className="text-slate-400">to</span>
                                        <input
                                            type="date"
                                            value={modalEndDate}
                                            onChange={(e) => setModalEndDate(e.target.value)}
                                            className="px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-sm w-full sm:w-auto text-slate-600"
                                            title="End Date"
                                        />
                                        {(modalStartDate || modalEndDate || modalSearchQuery) && (
                                            <button 
                                                onClick={() => { setModalStartDate(''); setModalEndDate(''); setModalSearchQuery(''); }}
                                                className="px-3 py-2 text-xs font-bold text-slate-500 bg-slate-200 hover:bg-slate-300 rounded-xl transition-all whitespace-nowrap"
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                                        <tr>
                                            <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('name')}>
                                                <div className="flex items-center gap-1">
                                                    Student {modalSortConfig.key === 'name' && (modalSortConfig.direction === 'asc' ? '↑' : '↓')}
                                                </div>
                                            </th>
                                            <th className="px-4 py-3">Contact</th>
                                            <th className="px-4 py-3">Reason</th>
                                            <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('date')}>
                                                <div className="flex items-center gap-1">
                                                    {breakListModalType === 'discontinued' ? 'Discontinued Date' : 'Break Date'} {modalSortConfig.key === 'date' && (modalSortConfig.direction === 'asc' ? '↑' : '↓')}
                                                </div>
                                            </th>
                                            {breakListModalType === 'rejoined' && (
                                                <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('rejoin_date')}>
                                                    <div className="flex items-center gap-1">
                                                        Rejoin Date {modalSortConfig.key === 'rejoin_date' && (modalSortConfig.direction === 'asc' ? '↑' : '↓')}
                                                    </div>
                                                </th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {getProcessedBreakList().length === 0 ? (
                                            <tr>
                                                <td colSpan="5" className="px-4 py-8 text-center text-slate-400">
                                                    No students found for this period or matching search.
                                                </td>
                                            </tr>
                                        ) : (
                                            getProcessedBreakList().map(student => (
                                                <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="font-bold text-slate-800">{student.name}</div>
                                                        <div className="text-xs text-slate-400">{student.crm_student_id}</div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="text-slate-600">{student.mobile}</div>
                                                        <div className="text-xs text-slate-400">{student.email}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={student.reason}>
                                                        {student.reason || '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-600">
                                                        {breakListModalType === 'rejoined' ? student.break_date : student.date}
                                                    </td>
                                                    {breakListModalType === 'rejoined' && (
                                                        <td className="px-4 py-3 font-medium text-emerald-600">
                                                            {student.rejoin_date}
                                                        </td>
                                                    )}
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Reassign Batch Modal */}
            {isReassignBatchModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
                    >
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="text-lg font-bold text-slate-800">Reassign Batch</h2>
                            <button onClick={() => setIsReassignBatchModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                                <X size={20} className="text-slate-500" />
                            </button>
                        </div>
                        <form onSubmit={handleReassignBatch} className="p-6">
                            <div className="mb-4">
                                <label className="block text-sm font-semibold text-slate-700 mb-2">New Mentor</label>
                                <select
                                    required
                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50"
                                    value={reassignBatchData.new_mentor_id}
                                    onChange={e => setReassignBatchData({ ...reassignBatchData, new_mentor_id: e.target.value })}
                                >
                                    <option value="">Select Mentor</option>
                                    {mentors.filter(m => m.id !== selectedBatch?.primary_mentor?.id && m.role === 'MENTOR').map(m => (
                                        <option key={m.id} value={m.id}>
                                            {m.first_name || m.last_name ? `${m.first_name || ''} ${m.last_name || ''}`.trim() : m.username}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="mb-6">
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Reason for Reassignment (Optional)</label>
                                <textarea
                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50"
                                    rows="3"
                                    placeholder="E.g., Mentor left the organization, workload balancing..."
                                    value={reassignBatchData.reason}
                                    onChange={e => setReassignBatchData({ ...reassignBatchData, reason: e.target.value })}
                                ></textarea>
                            </div>
                            <div className="flex gap-3 justify-end">
                                <button type="button" onClick={() => setIsReassignBatchModalOpen(false)} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" disabled={loading} className="px-5 py-2.5 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50">
                                    {loading ? 'Reassigning...' : 'Reassign Batch'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {isRejoinModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-emerald-50/50">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                                    <RefreshCw size={12} />
                                </span>
                                Rejoin Student
                            </h3>
                            <button onClick={() => setIsRejoinModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleRejoin} className="p-6">
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Rejoin Date</label>
                                <input
                                    type="date"
                                    value={rejoinDate}
                                    onChange={(e) => setRejoinDate(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-sm"
                                    required
                                />
                            </div>
                            <div className="flex gap-3 justify-end mt-6">
                                <button type="button" onClick={() => setIsRejoinModalOpen(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">Cancel</button>
                                <button type="submit" disabled={loading} className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-md shadow-emerald-200 flex items-center gap-2">
                                    {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : 'Confirm Rejoin'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Batch Assignment History Modal */}
            {isBatchHistoryModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
                    >
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">Batch Assignment History</h2>
                                <p className="text-sm text-slate-500">Timeline for {selectedBatch?.name}</p>
                            </div>
                            <button onClick={() => setIsBatchHistoryModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                                <X size={20} className="text-slate-500" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            {batchHistoryData.length === 0 ? (
                                <div className="text-center py-10">
                                    <History size={48} className="mx-auto text-slate-300 mb-4" />
                                    <p className="text-slate-500 font-medium">No reassignment history found for this batch.</p>
                                </div>
                            ) : (
                                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                                    {batchHistoryData.map((item, index) => (
                                        <div key={item.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                            {/* Icon */}
                                            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-indigo-50 text-indigo-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                                                <RefreshCw size={16} />
                                            </div>
                                            {/* Card */}
                                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-bold text-slate-800 text-sm">{new Date(item.assigned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                    <span className="text-xs font-medium text-slate-500">{new Date(item.assigned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                                <div className="text-slate-600 text-sm mb-3">
                                                    <p className="mb-1"><span className="font-semibold text-slate-700">From:</span> {item.previous_mentor_name}</p>
                                                    <p><span className="font-semibold text-indigo-700">To:</span> <span className="text-indigo-700 font-medium">{item.new_mentor_name}</span></p>
                                                </div>
                                                {item.reason && (
                                                    <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-600 italic border border-slate-100">
                                                        "{item.reason}"
                                                    </div>
                                                )}
                                                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400 font-medium flex justify-end">
                                                    Assigned by {item.assigned_by_name}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}

            {isFeeModalOpen && (() => {
                const filteredDefaulters = feeDefaulters.filter(student => {
                    const matchesSearch = !dueSearch || 
                        (student.name && student.name.toLowerCase().includes(dueSearch.toLowerCase())) || 
                        (student.crm_student_id && student.crm_student_id.toLowerCase().includes(dueSearch.toLowerCase())) ||
                        (student.mobile && student.mobile.includes(dueSearch));
                    
                    const matchesBatch = !dueFilterBatch || student.batch_name === dueFilterBatch;
                    const matchesMentor = !dueFilterMentor || student.mentor_name === dueFilterMentor;
                    
                    return matchesSearch && matchesBatch && matchesMentor;
                });

                const totalDueManual = filteredDefaulters.filter(s => !s.is_wise_integrated).reduce((sum, s) => sum + Number(s.due_amount || 0), 0);
                const totalDueWise = filteredDefaulters.filter(s => s.is_wise_integrated).reduce((sum, s) => sum + Number(s.due_amount || 0), 0);

                return (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[90]">
                        <div className="bg-white rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl animate-fadeIn max-h-[90vh] flex flex-col">
                            <div className="flex justify-between items-center p-6 border-b border-slate-100">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-800">
                                        Students with Due Fees
                                    </h2>
                                    <p className="text-sm text-slate-500 mt-1">
                                        Showing {filteredDefaulters.length} of {feeDefaulters.length} students • Total Dues: <strong>₹{filteredDefaulters.reduce((sum, s) => sum + Number(s.due_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                    </p>
                                    <div className="flex gap-4 mt-2 text-xs text-slate-400">
                                        <span>Manual CRM Dues: <strong className="text-slate-600">₹{totalDueManual.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                                        <span>Wise LMS Dues: <strong className="text-slate-600">₹{totalDueWise.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => exportDefaultersCSV(filteredDefaulters)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-all border border-indigo-100"
                                    >
                                        <Download size={14} /> Export CSV
                                    </button>
                                    <button onClick={() => setIsFeeModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-all">
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* Filters Row */}
                            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-4 items-center">
                                <div className="flex-1 min-w-[200px]">
                                    <input
                                        type="text"
                                        placeholder="Search name, ID, phone..."
                                        value={dueSearch}
                                        onChange={(e) => setDueSearch(e.target.value)}
                                        className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white"
                                    />
                                </div>
                                <div className="min-w-[150px]">
                                    <select
                                        value={dueFilterBatch}
                                        onChange={(e) => setDueFilterBatch(e.target.value)}
                                        className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white"
                                    >
                                        <option value="">All Batches</option>
                                        {[...new Set(feeDefaulters.map(s => s.batch_name))].filter(Boolean).map(batchName => (
                                            <option key={batchName} value={batchName}>{batchName}</option>
                                        ))}
                                    </select>
                                </div>
                                {(authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN' || authUser?.is_superuser) && (
                                    <div className="min-w-[150px]">
                                        <select
                                            value={dueFilterMentor}
                                            onChange={(e) => setDueFilterMentor(e.target.value)}
                                            className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white"
                                        >
                                            <option value="">All Mentors</option>
                                            {[...new Set(feeDefaulters.map(s => s.mentor_name))].filter(Boolean).map(mentorName => (
                                                <option key={mentorName} value={mentorName}>{mentorName}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {(dueSearch || dueFilterBatch || dueFilterMentor) && (
                                    <button
                                        onClick={() => {
                                            setDueSearch('');
                                            setDueFilterBatch('');
                                            setDueFilterMentor('');
                                        }}
                                        className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800 hover:underline"
                                    >
                                        Reset Filters
                                    </button>
                                )}
                            </div>

                            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar bg-slate-50/50">
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                    {filteredDefaulters.length > 0 ? (
                                        <div className="overflow-x-auto min-h-[300px]">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="border-b border-slate-200 bg-slate-50">
                                                        <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Student</th>
                                                        <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Batch</th>
                                                        <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Assigned Mentor</th>
                                                        <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Total Fee</th>
                                                        <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Paid</th>
                                                        <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Due</th>
                                                        <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Due Date</th>
                                                        <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredDefaulters.map((student) => (
                                                        <tr key={student.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-0">
                                                            <td className="px-4 py-3">
                                                                <div className="font-bold text-slate-800">{student.name}</div>
                                                                <div className="text-xs text-slate-500">{student.crm_student_id}</div>
                                                                <div className="text-xs text-slate-400">{student.mobile}</div>
                                                            </td>
                                                            <td className="px-4 py-3 text-sm text-slate-700 font-medium">{student.batch_name}</td>
                                                            <td className="px-4 py-3 text-sm text-slate-600">{student.mentor_name}</td>
                                                            <td className="px-4 py-3 font-semibold text-slate-700">₹{Number(student.total_fee).toFixed(2)}</td>
                                                            <td className="px-4 py-3 font-semibold text-emerald-600">₹{Number(student.paid_fee).toFixed(2)}</td>
                                                            <td className="px-4 py-3 font-bold text-red-600">₹{Number(student.due_amount).toFixed(2)}</td>
                                                            <td className="px-4 py-3 text-sm text-slate-600">{student.fee_due_date || '-'}</td>
                                                            <td className="px-4 py-3 text-right">
                                                                {!student.is_wise_integrated ? (
                                                                    <button
                                                                        onClick={async () => {
                                                                            try {
                                                                                await api.post(`students/${student.id}/mark_as_paid/`);
                                                                                alert('Student marked as paid successfully');
                                                                                fetchFeeDefaulters();
                                                                                fetchStudentsWithPagination();
                                                                            } catch(err) {
                                                                                alert('Failed to mark as paid');
                                                                            }
                                                                        }}
                                                                        className="px-3 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-colors"
                                                                    >
                                                                        Mark as Paid
                                                                    </button>
                                                                ) : (
                                                                    <span className="text-xs text-slate-400 italic">Wise LMS</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="p-8 text-center">
                                            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-3">
                                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                            <p className="text-slate-800 font-bold mb-1">No matches found</p>
                                            <p className="text-slate-500 text-sm">Adjust filters or search parameters.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {isCollectedModalOpen && (() => {
                const filteredCollected = collectedFees.filter(payment => {
                    const matchesSearch = !collectedSearch || 
                        (payment.student_name && payment.student_name.toLowerCase().includes(collectedSearch.toLowerCase())) || 
                        (payment.crm_student_id && payment.crm_student_id.toLowerCase().includes(collectedSearch.toLowerCase()));
                    
                    const matchesBatch = !collectedFilterBatch || payment.batch_name === collectedFilterBatch;
                    const matchesMentor = !collectedFilterMentor || payment.mentor_name === collectedFilterMentor;
                    
                    let matchesType = true;
                    if (collectedFilterType !== 'All') {
                        if (collectedFilterType === 'Manual') {
                            matchesType = payment.type.toLowerCase().includes('manual');
                        } else if (collectedFilterType === 'Online/Wise Sync') {
                            matchesType = payment.type.toLowerCase().includes('wise') || payment.type.toLowerCase().includes('lms') || payment.type.toLowerCase().includes('razorpay');
                        }
                    }
                    
                    return matchesSearch && matchesBatch && matchesMentor && matchesType;
                });

                const totalCollectedManual = filteredCollected.filter(p => p.type.toLowerCase().includes('manual')).reduce((sum, p) => sum + Number(p.amount || 0), 0);
                const totalCollectedOnline = filteredCollected.filter(p => !p.type.toLowerCase().includes('manual')).reduce((sum, p) => sum + Number(p.amount || 0), 0);

                return (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[90]">
                        <div className="bg-white rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl animate-fadeIn max-h-[90vh] flex flex-col">
                            <div className="flex justify-between items-center p-6 border-b border-slate-100">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-800">
                                        Collected Fees History
                                    </h2>
                                    <p className="text-sm text-slate-500 mt-1">
                                        Showing {filteredCollected.length} of {collectedFees.length} payments • Total Collected: <strong>₹{filteredCollected.reduce((sum, s) => sum + Number(s.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                    </p>
                                    <div className="flex gap-4 mt-2 text-xs text-slate-400">
                                        <span>Manual Collected: <strong className="text-slate-600">₹{totalCollectedManual.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                                        <span>Online Sync Collected: <strong className="text-slate-600">₹{totalCollectedOnline.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => exportCollectedCSV(filteredCollected)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-all border border-emerald-100"
                                    >
                                        <Download size={14} /> Export CSV
                                    </button>
                                    <button onClick={() => setIsCollectedModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-all">
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* Filters Row */}
                            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-4 items-center">
                                <div className="flex-1 min-w-[200px]">
                                    <input
                                        type="text"
                                        placeholder="Search student name, ID..."
                                        value={collectedSearch}
                                        onChange={(e) => setCollectedSearch(e.target.value)}
                                        className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white"
                                    />
                                </div>
                                <div className="min-w-[150px]">
                                    <select
                                        value={collectedFilterBatch}
                                        onChange={(e) => setCollectedFilterBatch(e.target.value)}
                                        className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white"
                                    >
                                        <option value="">All Batches</option>
                                        {[...new Set(collectedFees.map(p => p.batch_name))].filter(Boolean).map(batchName => (
                                            <option key={batchName} value={batchName}>{batchName}</option>
                                        ))}
                                    </select>
                                </div>
                                {(authUser?.role === 'SUPER_ADMIN' || authUser?.role === 'ADMIN' || authUser?.is_superuser) && (
                                    <div className="min-w-[150px]">
                                        <select
                                            value={collectedFilterMentor}
                                            onChange={(e) => setCollectedFilterMentor(e.target.value)}
                                            className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white"
                                        >
                                            <option value="">All Mentors</option>
                                            {[...new Set(collectedFees.map(p => p.mentor_name))].filter(Boolean).map(mentorName => (
                                                <option key={mentorName} value={mentorName}>{mentorName}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <div className="min-w-[150px]">
                                    <select
                                        value={collectedFilterType}
                                        onChange={(e) => setCollectedFilterType(e.target.value)}
                                        className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white"
                                    >
                                        <option value="All">All Types</option>
                                        <option value="Manual">Manual Payments</option>
                                        <option value="Online/Wise Sync">Online / Wise Sync</option>
                                    </select>
                                </div>
                                {(collectedSearch || collectedFilterBatch || collectedFilterMentor || collectedFilterType !== 'All') && (
                                    <button
                                        onClick={() => {
                                            setCollectedSearch('');
                                            setCollectedFilterBatch('');
                                            setCollectedFilterMentor('');
                                            setCollectedFilterType('All');
                                        }}
                                        className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800 hover:underline"
                                    >
                                        Reset Filters
                                    </button>
                                )}
                            </div>

                            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar bg-slate-50/50">
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                    {filteredCollected.length > 0 ? (
                                        <div className="overflow-x-auto min-h-[300px]">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="border-b border-slate-200 bg-slate-50">
                                                        <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Student</th>
                                                        <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Batch</th>
                                                        <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Assigned Mentor</th>
                                                        <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Amount</th>
                                                        <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Payment Date</th>
                                                        <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Type</th>
                                                        <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest">Ref ID / Notes</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredCollected.map((payment) => (
                                                        <tr key={payment.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-0">
                                                            <td className="px-4 py-3">
                                                                <div className="font-bold text-slate-800">{payment.student_name}</div>
                                                                <div className="text-xs text-slate-500">{payment.crm_student_id}</div>
                                                            </td>
                                                            <td className="px-4 py-3 text-sm text-slate-700 font-medium">{payment.batch_name}</td>
                                                            <td className="px-4 py-3 text-sm text-slate-600">{payment.mentor_name}</td>
                                                            <td className="px-4 py-3 font-bold text-emerald-600">₹{Number(payment.amount).toFixed(2)}</td>
                                                            <td className="px-4 py-3 text-sm text-slate-600">{payment.date}</td>
                                                            <td className="px-4 py-3 text-xs">
                                                                <span className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${payment.type.includes('Manual') ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                                    {payment.type}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-xs text-slate-500 max-w-[150px] truncate" title={payment.ref_id}>
                                                                {payment.ref_id}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="p-8 text-center">
                                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-3">
                                                <IndianRupee size={24} />
                                            </div>
                                            <p className="text-slate-800 font-bold mb-1">No collections</p>
                                            <p className="text-slate-500 text-sm">No fees match the selected filters.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Mark Paid Modal */}
            {isMarkPaidModalOpen && markPaidStudent && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[90] animate-fadeIn">
                    <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-fadeIn">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <span className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <IndianRupee size={16} />
                                </span>
                                Mark Monthly Payment
                            </h2>
                            <button onClick={() => setIsMarkPaidModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-all">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleMarkPaidSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Student</label>
                                <div className="text-sm font-semibold text-slate-800 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-100">
                                    {markPaidStudent.first_name} {markPaidStudent.last_name} ({markPaidStudent.crm_student_id})
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Start Month</label>
                                    <div className="text-sm font-semibold text-slate-800 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-100">
                                        {new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Duration</label>
                                    <select
                                        value={markPaidForm.numberOfMonths}
                                        onChange={(e) => {
                                            const months = parseInt(e.target.value) || 1;
                                            const baseFee = markPaidStudent?.total_fee || 0;
                                            setMarkPaidForm(prev => ({
                                                ...prev,
                                                numberOfMonths: months,
                                                amount: (baseFee * months).toFixed(2)
                                            }));
                                        }}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-sm font-semibold text-slate-800 bg-white"
                                    >
                                        <option value={1}>1 Month</option>
                                        <option value={2}>2 Months</option>
                                        <option value={3}>3 Months</option>
                                        <option value={4}>4 Months</option>
                                        <option value={5}>5 Months</option>
                                        <option value={6}>6 Months</option>
                                        <option value={7}>7 Months</option>
                                        <option value={8}>8 Months</option>
                                        <option value={9}>9 Months</option>
                                        <option value={10}>10 Months</option>
                                        <option value={11}>11 Months</option>
                                        <option value={12}>12 Months (1 Year)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Total Amount (₹)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        required
                                        value={markPaidForm.amount}
                                        onChange={(e) => setMarkPaidForm({ ...markPaidForm, amount: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-sm font-bold text-slate-800"
                                        placeholder="Enter amount"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Notes (Optional)</label>
                                <textarea
                                    value={markPaidForm.notes}
                                    onChange={(e) => setMarkPaidForm({ ...markPaidForm, notes: e.target.value })}
                                    placeholder="Enter payment notes (e.g. cash, bank transfer details)..."
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all resize-none h-24 text-sm"
                                />
                            </div>
                            <div className="flex gap-3 justify-end pt-2">
                                <button type="button" onClick={() => setIsMarkPaidModalOpen(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">Cancel</button>
                                <button type="submit" disabled={loading} className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-md shadow-indigo-100 flex items-center gap-2">
                                    {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : 'Confirm Payment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Payment History Modal */}
            {isHistoryModalOpen && historyStudent && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[90] animate-fadeIn">
                    <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-fadeIn max-h-[85vh] flex flex-col">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
                            <div>
                                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                                        <History size={16} />
                                    </span>
                                    Payment History
                                </h2>
                                <p className="text-xs text-slate-500 mt-1">Payment logs for {historyStudent.first_name} {historyStudent.last_name}</p>
                            </div>
                            <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-all">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                            {historyLoading ? (
                                <div className="flex justify-center items-center py-12">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                                </div>
                            ) : paymentHistory.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <History size={40} className="mx-auto text-slate-300 mb-3" />
                                    <p className="text-sm font-medium">No monthly payment history found.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto border border-slate-100 rounded-2xl shadow-sm bg-white">
                                    <table className="w-full text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-100 bg-slate-50 text-slate-400 font-bold text-xs uppercase tracking-wider">
                                                <th className="p-4">Month</th>
                                                <th className="p-4">Paid Date</th>
                                                <th className="p-4 text-right">Amount</th>
                                                <th className="p-4">Marked By</th>
                                                <th className="p-4">Notes</th>
                                                <th className="p-4 text-center">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {paymentHistory.map((p) => (
                                                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="p-4 font-semibold text-slate-800">{p.month_name}</td>
                                                    <td className="p-4 text-slate-600">{p.paid_date}</td>
                                                    <td className="p-4 text-right font-bold text-emerald-600">₹{p.amount?.toLocaleString()}</td>
                                                    <td className="p-4 text-slate-600 font-medium">{p.marked_by}</td>
                                                    <td className="p-4 text-slate-500 max-w-xs truncate" title={p.notes}>{p.notes || '-'}</td>
                                                    <td className="p-4 text-center">
                                                        <button
                                                            onClick={() => handleUnmarkPaid(historyStudent, p.month)}
                                                            className="text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-100 px-2.5 py-1 transition-colors uppercase tracking-wider"
                                                        >
                                                            Unmark
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button onClick={() => setIsHistoryModalOpen(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-sm">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MentorModule;
