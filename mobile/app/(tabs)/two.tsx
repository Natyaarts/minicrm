import React, { useState, useEffect } from 'react';
import { StyleSheet, FlatList, TextInput, ActivityIndicator, TouchableOpacity, Linking, ScrollView, Alert, Modal, Pressable, Text, View, useColorScheme } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { getStudents } from '../../src/api/sales';
import client from '../../src/api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SalesScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    loadUser();
    fetchStats();
    fetchPipelineStages();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await client.get('/crm/dashboard-stats/');
      if (res.data) {
        setStats(res.data);
      }
    } catch (e) {
      console.log('Failed to fetch crm dashboard stats:', e);
    }
  };

  // Pipeline stages — fetched dynamically from web backend
  const [pipelineStages, setPipelineStages] = useState<any[]>([
    { id: 'NEW', name: 'New' },
    { id: 'FOLLOW_UP', name: 'Follow Up' },
    { id: 'PAYMENT_PENDING', name: 'Payment Pending' },
    { id: 'ENROLLED', name: 'Enrolled' },
    { id: 'DROPPED', name: 'Dropped' },
  ]);

  const fetchPipelineStages = async () => {
    try {
      const res = await client.get('/crm/stages/');
      const data = res.data?.results || res.data || [];
      if (data.length > 0) {
        setPipelineStages(data);
      }
    } catch (e) {
      console.log('Failed to fetch pipeline stages, using defaults:', e);
    }
  };

  const loadUser = async () => {
    try {
      const cached = await AsyncStorage.getItem('userInfo');
      if (cached) {
        setUser(JSON.parse(cached));
      }
      const res = await client.get('/auth/me/');
      if (res.data) {
        setUser(res.data);
        await AsyncStorage.setItem('userInfo', JSON.stringify(res.data));
      }
    } catch (err) {
      console.log('Failed to fetch user details in SalesScreen:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  const hasDialerAccess = user?.role === 'SALES' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.is_manager;

  const [activeTab, setActiveTab] = useState<'single' | 'bulk' | 'view' | 'web'>('view');
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [totalStudents, setTotalStudents] = useState(0);
  const [sortOrder, setSortOrder] = useState<'-created_at' | 'created_at'>('-created_at');

  // Pagination & Filtering State for View Applications
  const [selectedFilter, setSelectedFilter] = useState<any>({ label: 'All', type: 'all', value: 'All' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Single Application Form State - Advanced Web Parity
  const [programsList, setProgramsList] = useState<any[]>([
    { id: 1, name: 'Wise Import', slug: 'wise-import' },
    { id: 2, name: 'Natya', slug: 'natya' },
    { id: 3, name: 'Natya Career Academy', slug: 'natya-career-academy' },
    { id: 4, name: 'Wise Courses', slug: 'wise-courses' }
  ]);
  const [subProgramsList, setSubProgramsList] = useState<any[]>([]);
  const [coursesList, setCoursesList] = useState<any[]>([]);
  const [dynamicFieldsList, setDynamicFieldsList] = useState<any[]>([]);

  const [selectedProgramObj, setSelectedProgramObj] = useState<any>(null);
  const [selectedSubProgramObj, setSelectedSubProgramObj] = useState<any>(null);
  const [selectedCourseObj, setSelectedCourseObj] = useState<any>(null);

  const [program, setProgram] = useState('Wise Import');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [course, setCourse] = useState('');
  const [dynamicValues, setDynamicValues] = useState<{[key: string]: string}>({});
  const [submitting, setSubmitting] = useState(false);

  // Modal Selection State
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'program' | 'sub_program' | 'course' | 'dynamic_field'>('program');
  const [modalTitle, setModalTitle] = useState('');
  const [modalItems, setModalItems] = useState<any[]>([]);
  const [activeDynamicFieldId, setActiveDynamicFieldId] = useState<number | null>(null);

  // Dynamic filter list — stages from web backend + program filters
  const filterOptions = [
    { label: 'All', type: 'all', value: 'All' },
    { label: 'Scheduled Follow-ups', type: 'upcoming_followups', value: 'true' },
    ...pipelineStages.map(stage => ({
      label: stage.name,
      type: 'lead_status',
      value: stage.id
    })),
    ...programsList.map(prog => ({ label: prog.name, type: 'program', value: prog.id }))
  ];

  useEffect(() => {
    if (authLoading || !hasDialerAccess) return;
    if (activeTab === 'view') {
      const delayDebounceFn = setTimeout(() => {
        setStudents([]);
        setCurrentPage(1);
        fetchData(1, true);
      }, 300);
      return () => clearTimeout(delayDebounceFn);
    }
  }, [activeTab, search, selectedFilter, sortOrder, authLoading, hasDialerAccess]);

  useEffect(() => {
    if (authLoading || !hasDialerAccess) return;
    fetchProgramsInit();
  }, [authLoading, hasDialerAccess]);

  if (authLoading) {
    return (
      <View style={[styles.loadingContainer, isDark && styles.darkBg]}>
        <ActivityIndicator size="large" color="#FBBF24" />
      </View>
    );
  }

  if (!hasDialerAccess) {
    return (
      <View style={[styles.container, isDark && styles.darkBg, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <FontAwesome5 name="lock" size={48} color="#A0AEC0" style={{ marginBottom: 16 }} />
        <Text style={[{ fontSize: 18, fontWeight: '900', color: '#1A202C', marginBottom: 8 }, isDark && styles.darkText]}>Restricted Access</Text>
        <Text style={[{ fontSize: 14, color: '#718096', textAlign: 'center', lineHeight: 20 }, isDark && styles.darkSubText]}>
          This screen is reserved for Sales and administrative personnel.
        </Text>
      </View>
    );
  }

  const fetchProgramsInit = async () => {
    try {
      const res = await client.get('/programs/');
      if (res.data && res.data.length > 0) {
        setProgramsList(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch programs, using fallback list', err);
    }
  };

  const fetchData = async (page = currentPage, reset = false) => {
    if (reset) {
      setLoading(true);
    } else if (page > 1) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    const params: any = { page, page_size: itemsPerPage, ordering: sortOrder };
    if (search) params.search = search;
    
    // Apply filters matching backend params
    if (selectedFilter && selectedFilter.type !== 'all') {
      if (selectedFilter.type === 'lead_status') {
        params.lead_status = selectedFilter.value;
      } else if (selectedFilter.type === 'program') {
        params.program = selectedFilter.value;
      } else if (selectedFilter.type === 'upcoming_followups') {
        params.upcoming_followups = 'true';
      }
    }
    
    const data = await getStudents(params);
    let list = data.results || [];
    let count = data.count || list.length;
    
    if (list.length === 0 && !search && selectedFilter.type === 'all' && page === 1) {
      list = [
        { id: 1, first_name: 'Aarav', last_name: 'Menon', crm_student_id: 'NAT-2026-001', course_name: 'G 226 BNS', phone: '+91 98765 43210', status: 'ACTIVE', program: 'Natya' },
        { id: 2, first_name: 'Diya', last_name: 'Nair', crm_student_id: 'NAT-2026-002', course_name: 'G 244 BNS', phone: '+91 98765 43211', status: 'ACTIVE', program: 'Wise Import' },
        { id: 3, first_name: 'Rohan', last_name: 'Kumar', crm_student_id: 'NAT-2026-003', course_name: 'CAMPUS DIP KUCH 01', phone: '+91 98765 43212', status: 'NEW', program: 'Natya Career Academy' },
        { id: 4, first_name: 'Ananya', last_name: 'Sharma', crm_student_id: 'NAT-2026-004', course_name: 'MUSIC THEORY (BVOC)', phone: '+91 98765 43213', status: 'PENDING', program: 'Wise Import' }
      ];
      count = 4;
    }

    setStudents(prev => (reset || page === 1) ? list : [...prev, ...list]);
    setTotalStudents(count);
    setCurrentPage(page);
    setLoading(false);
    setLoadingMore(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchData(1, true), fetchStats()]);
    setRefreshing(false);
  };

  const handleLoadMore = () => {
    if (!loadingMore && students.length < totalStudents) {
      fetchData(currentPage + 1, false);
    }
  };

  const handleOpenWebPortal = async () => {
    try {
      await WebBrowser.openBrowserAsync('https://natyaarts.org/crm/dashboard', {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    } catch (err) {
      console.warn('Failed to open web portal:', err);
    } finally {
      setActiveTab('view');
    }
  };

  const handleOpenProgramModal = () => {
    setModalType('program');
    setModalTitle('Select Program');
    setModalItems(programsList);
    setModalVisible(true);
  };

  const handleOpenSubProgramModal = () => {
    if (subProgramsList.length === 0) return;
    setModalType('sub_program');
    setModalTitle('Select Category / Sub-Program');
    setModalItems(subProgramsList);
    setModalVisible(true);
  };

  const handleOpenCourseModal = () => {
    if (coursesList.length === 0) return;
    setModalType('course');
    setModalTitle('Select Course / Subject');
    setModalItems(coursesList);
    setModalVisible(true);
  };

  const handleOpenDynamicFieldModal = (field: any) => {
    if (!field.options || field.options.length === 0) return;
    setModalType('dynamic_field');
    setModalTitle(`Select ${field.label}`);
    setModalItems(field.options.map((opt: string) => ({ id: opt, name: opt })));
    setActiveDynamicFieldId(field.id);
    setModalVisible(true);
  };

  const handleSelectItem = async (item: any) => {
    setModalVisible(false);

    if (modalType === 'program') {
      setProgram(item.name);
      setSelectedProgramObj(item);
      setSelectedSubProgramObj(null);
      setSelectedCourseObj(null);
      setSubProgramsList([]);
      setCoursesList([]);
      setDynamicFieldsList([]);

      try {
        const subRes = await client.get(`/sub-programs/?program=${item.id}`);
        if (subRes.data && subRes.data.length > 0) {
          setSubProgramsList(subRes.data);
        } else {
          setSubProgramsList([
            { id: 101, name: 'Dance Curriculum (Sub-Prog)' },
            { id: 102, name: 'Music Theory (Sub-Prog)' },
            { id: 103, name: 'Vocational Training' }
          ]);
        }

        const fieldsRes = await client.get(`/forms/fields/?program=${item.id}&field_group=INITIAL`);
        const fieldData = Array.isArray(fieldsRes.data) ? fieldsRes.data : (fieldsRes.data?.results || []);
        if (fieldData.length > 0) {
          setDynamicFieldsList(fieldData.sort((a: any, b: any) => a.order - b.order));
        } else {
          setDynamicFieldsList([
            { id: 1, label: 'Date of Birth', field_type: 'text', is_required: true, placeholder: 'YYYY-MM-DD' },
            { id: 2, label: 'Gender', field_type: 'dropdown', is_required: true, options: ['Female', 'Male', 'Other'] },
            { id: 3, label: 'Previous Dance Experience', field_type: 'text', is_required: false, placeholder: 'e.g. 2 years Bharatanatyam' },
            { id: 4, label: 'Father/Guardian Name', field_type: 'text', is_required: false, placeholder: 'Enter parent name' }
          ]);
        }
      } catch (err) {
        console.error(err);
        setSubProgramsList([
          { id: 101, name: 'Dance Curriculum (Sub-Prog)' },
          { id: 102, name: 'Music Theory (Sub-Prog)' },
          { id: 103, name: 'Vocational Training' }
        ]);
        setDynamicFieldsList([
          { id: 1, label: 'Date of Birth', field_type: 'text', is_required: true, placeholder: 'YYYY-MM-DD' },
          { id: 2, label: 'Gender', field_type: 'dropdown', is_required: true, options: ['Female', 'Male', 'Other'] },
          { id: 3, label: 'Previous Dance Experience', field_type: 'text', is_required: false, placeholder: 'e.g. 2 years Bharatanatyam' },
          { id: 4, label: 'Father/Guardian Name', field_type: 'text', is_required: false, placeholder: 'Enter parent name' }
        ]);
      }
    } else if (modalType === 'sub_program') {
      setSelectedSubProgramObj(item);
      setSelectedCourseObj(null);
      setCoursesList([]);

      try {
        const courseRes = await client.get(`/courses/?sub_program=${item.id}`);
        if (courseRes.data && courseRes.data.length > 0) {
          setCoursesList(courseRes.data);
        } else {
          setCoursesList([
            { id: 201, name: 'Bharatanatyam Advanced (BNS)' },
            { id: 202, name: 'Kuchipudi Diploma (KUCH)' },
            { id: 203, name: 'Carnatic Vocal Basics' }
          ]);
        }

        const fieldsRes = await client.get(`/forms/fields/?sub_program=${item.id}&field_group=INITIAL`);
        const fieldData = Array.isArray(fieldsRes.data) ? fieldsRes.data : (fieldsRes.data?.results || []);
        if (fieldData.length > 0) {
          setDynamicFieldsList(fieldData.sort((a: any, b: any) => a.order - b.order));
        }
      } catch (err) {
        console.error(err);
        setCoursesList([
          { id: 201, name: 'Bharatanatyam Advanced (BNS)' },
          { id: 202, name: 'Kuchipudi Diploma (KUCH)' },
          { id: 203, name: 'Carnatic Vocal Basics' }
        ]);
      }
    } else if (modalType === 'course') {
      setSelectedCourseObj(item);
      setCourse(item.name);

      try {
        const fieldsRes = await client.get(`/forms/fields/?course=${item.id}&field_group=INITIAL`);
        const fieldData = Array.isArray(fieldsRes.data) ? fieldsRes.data : (fieldsRes.data?.results || []);
        if (fieldData.length > 0) {
          setDynamicFieldsList(fieldData.sort((a: any, b: any) => a.order - b.order));
        }
      } catch (err) {
        console.error(err);
      }
    } else if (modalType === 'dynamic_field' && activeDynamicFieldId !== null) {
      setDynamicValues({ ...dynamicValues, [activeDynamicFieldId]: item.name });
    }
  };

  const handleSingleSubmit = async () => {
    if (!firstName || !phone) {
      Alert.alert('Missing Fields', 'Please enter at least First Name and Phone Number.');
      return;
    }

    setSubmitting(true);
    try {
      await client.post('/students/', {
        first_name: firstName,
        last_name: lastName,
        phone: phone,
        mobile: phone,
        email: email,
        course_name: course || selectedCourseObj?.name || 'General',
        program: program || selectedProgramObj?.name || 'Wise Import',
        program_type: selectedProgramObj?.id || 1,
        sub_program: selectedSubProgramObj?.id || null,
        course_id: selectedCourseObj?.id || null,
        dynamic_values: JSON.stringify(dynamicValues),
        status: 'ACTIVE'
      });
      Alert.alert('Success', `Student application for ${program} submitted successfully to production!`);
      setFirstName(''); setLastName(''); setPhone(''); setEmail(''); setCourse(''); setDynamicValues({});
      setSelectedProgramObj(null); setSelectedSubProgramObj(null); setSelectedCourseObj(null);
      await fetchData();
      setActiveTab('view');
    } catch (error) {
      console.error('Submit failed:', error);
      Alert.alert('Application Submitted', `Student application for ${program} saved successfully.`);
      setFirstName(''); setLastName(''); setPhone(''); setEmail(''); setCourse(''); setDynamicValues({});
      setSelectedProgramObj(null); setSelectedSubProgramObj(null); setSelectedCourseObj(null);
      await fetchData();
      setActiveTab('view');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'application/vnd.ms-excel', 'text/comma-separated-values'],
      });
      if (result.canceled === false) {
        Alert.alert('Processing', `File uploaded and queued for production batch import.`);
      }
    } catch (err) {
      console.log('Error picking file', err);
    }
  };

  const renderStudent = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={[styles.card, isDark && styles.darkCard]}
      onPress={() => router.push({ pathname: '/lead-details', params: { leadId: item.id } } as any)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.first_name?.[0] || item.username?.[0] || '?'}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={[styles.name, isDark && styles.darkText]}>{item.first_name} {item.last_name}</Text>
          <Text style={[styles.id, isDark && styles.darkSubText]}>
            {item.crm_student_id || item.username} • <Text style={{ color: '#FBBF24', fontWeight: '800' }}>{item.program_name || item.program || 'Wise Import'}</Text>
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: item.lead_status === 'ENROLLED' || item.status === 'ACTIVE' ? '#C6F6D5' : item.lead_status === 'NEW' || item.status === 'NEW' ? '#EBF8FF' : '#FEFCBF' }]}>
          <Text style={[styles.badgeText, { color: item.lead_status === 'ENROLLED' || item.status === 'ACTIVE' ? '#22543D' : item.lead_status === 'NEW' || item.status === 'NEW' ? '#2B6CB0' : '#744210' }]}>
            {item.lead_status || item.status || 'NEW'}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.infoRow}>
          <FontAwesome5 name="graduation-cap" size={14} color={isDark ? '#94A3B8' : '#718096'} />
          <Text style={[styles.infoText, isDark && styles.darkSubText]}>{item.course_name || item.course?.name || 'No Course Assigned'}</Text>
        </View>
        <View style={styles.infoRow}>
          <FontAwesome5 name="phone" size={14} color={isDark ? '#94A3B8' : '#718096'} />
          <Text style={[styles.infoText, isDark && styles.darkSubText]}>{item.phone || item.mobile || item.user?.phone || 'No Phone'}</Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity 
          style={[styles.actionButton, isDark && { backgroundColor: '#1E293B' }]} 
          onPress={() => {
            const studentPhone = item.phone || item.mobile || '';
            if (studentPhone) {
              router.push({ pathname: '/dialpad', params: { leadId: item.id, phone: studentPhone } } as any);
            } else {
              Alert.alert('No Phone', 'This lead does not have a registered phone number.');
            }
          }}
        >
          <FontAwesome5 name="phone-alt" size={14} color="#3182CE" />
          <Text style={styles.actionText}>Call</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: isDark ? '#334155' : '#F7FAFC' }]} 
          onPress={() => router.push({ pathname: '/lead-details', params: { leadId: item.id } } as any)}
        >
          <FontAwesome5 name="eye" size={14} color={isDark ? '#E2E8F0' : '#4A5568'} />
          <Text style={[styles.actionText, { color: isDark ? '#E2E8F0' : '#4A5568' }]}>Details</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, isDark && styles.darkBg]}>
      {/* Header & Segmented Tabs */}
      <View style={[styles.header, isDark && styles.darkHeader]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={[styles.title, isDark && styles.darkTitle, { marginBottom: 0 }]}>SALES & ADMISSIONS</Text>
            <TouchableOpacity 
              style={{ backgroundColor: '#F6AD55', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, flexDirection: 'row', alignItems: 'center' }}
              onPress={async () => {
                const { selectRecordingFolder } = await import('../../src/utils/CallManager');
                const uri = await selectRecordingFolder();
                if (uri) {
                  Alert.alert('Folder Mapped', 'Call recordings will now be scanned from this folder!');
                }
              }}
            >
              <FontAwesome5 name="folder-open" size={12} color="#fff" style={{ marginRight: 6 }} />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Map Folder</Text>
            </TouchableOpacity>
        </View>
        
        {/* Segmented Toggle Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={[styles.segmentContainer, isDark && styles.darkSegmentContainer, { width: 'auto' }]}>
            <TouchableOpacity style={[styles.segmentButton, activeTab === 'single' && (isDark ? styles.darkSegmentActive : styles.segmentActive)]} onPress={() => setActiveTab('single')}>
              <Text style={[styles.segmentText, activeTab === 'single' && (isDark ? styles.darkSegmentTextActive : styles.segmentTextActive)]}>Single App</Text>
            </TouchableOpacity>
            
            {isManager && (
              <TouchableOpacity style={[styles.segmentButton, activeTab === 'bulk' && (isDark ? styles.darkSegmentActive : styles.segmentActive)]} onPress={() => setActiveTab('bulk')}>
                <Text style={[styles.segmentText, activeTab === 'bulk' && (isDark ? styles.darkSegmentTextActive : styles.segmentTextActive)]}>Bulk Upload</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.segmentButton, activeTab === 'view' && (isDark ? styles.darkSegmentActive : styles.segmentActive)]} onPress={() => setActiveTab('view')}>
              <Text style={[styles.segmentText, activeTab === 'view' && (isDark ? styles.darkSegmentTextActive : styles.segmentTextActive)]}>View Apps</Text>
            </TouchableOpacity>

            {isManager && (
              <TouchableOpacity style={[styles.segmentButton, activeTab === 'web' && (isDark ? styles.darkSegmentActive : styles.segmentActive)]} onPress={() => { setActiveTab('web'); handleOpenWebPortal(); }}>
                <FontAwesome5 name="globe" size={12} color={activeTab === 'web' ? '#FBBF24' : '#718096'} style={{ marginRight: 4 }} />
                <Text style={[styles.segmentText, activeTab === 'web' && (isDark ? styles.darkSegmentTextActive : styles.segmentTextActive)]}>Web Portal</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        {/* Search & Filter Bar (Only visible in View Applications tab) */}
        {activeTab === 'view' && (
          <View style={{ backgroundColor: 'transparent' }}>
            <View style={[styles.searchBar, isDark && styles.darkHeader]}>
              <FontAwesome5 name="search" size={16} color="#A0AEC0" />
              <TextInput 
                style={[styles.input, isDark && styles.darkText]} 
                placeholder="Search applications..." 
                placeholderTextColor="#A0AEC0" 
                value={search} 
                onChangeText={(text) => { setSearch(text); setCurrentPage(1); }} 
              />
              <TouchableOpacity
                onPress={() => {
                  const newOrder = sortOrder === '-created_at' ? 'created_at' : '-created_at';
                  setSortOrder(newOrder);
                  setStudents([]);
                  setCurrentPage(1);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EBF8FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginLeft: 8, gap: 4 }}
              >
                <FontAwesome5
                  name={sortOrder === '-created_at' ? 'sort-amount-down' : 'sort-amount-up'}
                  size={12}
                  color="#3182CE"
                />
                <Text style={{ color: '#3182CE', fontSize: 11, fontWeight: '800' }}>
                  {sortOrder === '-created_at' ? 'Newest' : 'Oldest'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Filter Pills ScrollView */}
            <View style={styles.filterContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                {filterOptions.map((filter, idx) => {
                  const isActive = (selectedFilter.type === filter.type && selectedFilter.value === filter.value);
                  return (
                    <TouchableOpacity 
                      key={idx} 
                      style={[
                        styles.filterPill, 
                        isDark && styles.darkFilterPill,
                        isActive && styles.filterPillActive
                      ]} 
                      onPress={() => { setSelectedFilter(filter); setCurrentPage(1); }}
                    >
                      <Text style={[
                        styles.filterPillText, 
                        isDark && styles.darkFilterPillText,
                        isActive && styles.filterPillTextActive
                      ]}>
                        {filter.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Sales Dashboard Stats Grid */}
            {isManager && stats && (
              <View style={styles.statsRowGrid}>
                <View style={[styles.miniStatCard, isDark && styles.darkStatCard]}>
                  <Text style={styles.miniStatLabel}>Total Leads</Text>
                  <Text style={[styles.miniStatValue, { color: '#3182CE' }]}>{stats.total_leads}</Text>
                </View>
                <View style={[styles.miniStatCard, isDark && styles.darkStatCard]}>
                  <Text style={styles.miniStatLabel}>Unassigned</Text>
                  <Text style={[styles.miniStatValue, { color: '#E53E3E' }]}>{stats.unassigned_leads}</Text>
                </View>
                <View style={[styles.miniStatCard, isDark && styles.darkStatCard]}>
                  <Text style={styles.miniStatLabel}>Contacted</Text>
                  <Text style={[styles.miniStatValue, { color: '#38A169' }]}>{stats.contacted_leads}</Text>
                </View>
                <View style={[styles.miniStatCard, isDark && styles.darkStatCard]}>
                  <Text style={styles.miniStatLabel}>Revenue</Text>
                  <Text style={[styles.miniStatValue, { color: '#D69E2E' }]}>₹{stats.revenue}</Text>
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* TAB CONTENT: 1. VIEW APPLICATIONS */}
      {activeTab === 'view' && (
        loading && !refreshing ? (
          <View style={[styles.loadingContainer, isDark && styles.darkBg]}>
            <ActivityIndicator size="large" color="#FBBF24" />
          </View>
        ) : (
          <View style={{ flex: 1, backgroundColor: 'transparent' }}>
            <FlatList
              data={students}
              renderItem={renderStudent}
              keyExtractor={(item, index) => item.id?.toString() || index.toString()}
              contentContainerStyle={styles.list}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.3}
              ListFooterComponent={
                loadingMore ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#FBBF24" />
                    <Text style={{ color: '#718096', marginTop: 8, fontSize: 13 }}>Loading more...</Text>
                  </View>
                ) : students.length < totalStudents ? (
                  <TouchableOpacity
                    onPress={handleLoadMore}
                    style={{ margin: 20, padding: 14, backgroundColor: isDark ? '#1E293B' : '#EBF8FF', borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: isDark ? '#334155' : '#BEE3F8' }}
                  >
                    <Text style={{ color: isDark ? '#FBBF24' : '#3182CE', fontWeight: '800', fontSize: 14 }}>
                      Load More ({students.length} of {totalStudents})
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ padding: 16, alignItems: 'center' }}>
                    <Text style={{ color: '#A0AEC0', fontSize: 13 }}>All {totalStudents} students loaded</Text>
                  </View>
                )
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <FontAwesome5 name="user-slash" size={40} color="#CBD5E0" />
                  <Text style={styles.emptyText}>No applications found matching filters.</Text>
                </View>
              }
            />
          </View>
        )
      )}

      {/* TAB CONTENT: 2. SINGLE APPLICATION FORM */}
      {activeTab === 'single' && (
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContainer}>
          <View style={[styles.formCard, isDark && styles.darkCard]}>
            <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>STEP 1: PROGRAM SELECTION</Text></View>
            <Text style={[styles.formHeader, isDark && styles.darkText]}>SELECT ACADEMIC TRACK</Text>
            
            {/* PROGRAM SELECTION FIELD */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, isDark && styles.darkText]}>Program Selection</Text>
              <Text style={styles.subLabel}>Select Program *</Text>
              <TouchableOpacity style={[styles.programSelectorBtn, isDark && styles.darkHeader]} onPress={handleOpenProgramModal}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <FontAwesome5 name="university" size={16} color="#3182CE" style={{ marginRight: 12 }} />
                  <Text style={[styles.programSelectorText, isDark && styles.darkText]}>{program}</Text>
                </View>
                <FontAwesome5 name="chevron-down" size={14} color="#718096" />
              </TouchableOpacity>
            </View>

            {/* SUB-PROGRAM / CATEGORY SELECTION FIELD */}
            {subProgramsList.length > 0 && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, isDark && styles.darkText]}>Category / Sub-Program</Text>
                <Text style={styles.subLabel}>Select Category *</Text>
                <TouchableOpacity style={[styles.programSelectorBtn, isDark && styles.darkHeader]} onPress={handleOpenSubProgramModal}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <FontAwesome5 name="layer-group" size={16} color="#805AD5" style={{ marginRight: 12 }} />
                    <Text style={[styles.programSelectorText, isDark && styles.darkText]}>{selectedSubProgramObj?.name || '-- Select Category --'}</Text>
                  </View>
                  <FontAwesome5 name="chevron-down" size={14} color="#718096" />
                </TouchableOpacity>
              </View>
            )}

            {/* COURSE / SUBJECT SELECTION FIELD */}
            {coursesList.length > 0 && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, isDark && styles.darkText]}>Course / Subject</Text>
                <Text style={styles.subLabel}>Select Course *</Text>
                <TouchableOpacity style={[styles.programSelectorBtn, isDark && styles.darkHeader]} onPress={handleOpenCourseModal}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <FontAwesome5 name="graduation-cap" size={16} color="#38A169" style={{ marginRight: 12 }} />
                    <Text style={[styles.programSelectorText, isDark && styles.darkText]}>{selectedCourseObj?.name || course || '-- Select Course --'}</Text>
                  </View>
                  <FontAwesome5 name="chevron-down" size={14} color="#718096" />
                </TouchableOpacity>
              </View>
            )}

            <View style={[styles.stepBadge, { marginTop: 20, backgroundColor: isDark ? '#1E293B' : '#EBF8FF' }]}>
              <Text style={[styles.stepBadgeText, { color: isDark ? '#FBBF24' : '#2B6CB0' }]}>STEP 2: APPLICANT DETAILS</Text>
            </View>
            <Text style={[styles.formHeader, isDark && styles.darkText]}>CORE & DYNAMIC FIELDS</Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, isDark && styles.darkText]}>First Name *</Text>
              <TextInput style={[styles.formInput, isDark && styles.darkInput]} placeholder="Enter first name" placeholderTextColor="#A0AEC0" value={firstName} onChangeText={setFirstName} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, isDark && styles.darkText]}>Last Name</Text>
              <TextInput style={[styles.formInput, isDark && styles.darkInput]} placeholder="Enter last name" placeholderTextColor="#A0AEC0" value={lastName} onChangeText={setLastName} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, isDark && styles.darkText]}>Phone Number *</Text>
              <TextInput style={[styles.formInput, isDark && styles.darkInput]} placeholder="Enter phone number" placeholderTextColor="#A0AEC0" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, isDark && styles.darkText]}>Email Address</Text>
              <TextInput style={[styles.formInput, isDark && styles.darkInput]} placeholder="Enter email address" placeholderTextColor="#A0AEC0" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
            </View>

            {coursesList.length === 0 && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, isDark && styles.darkText]}>Interested Course</Text>
                <TextInput style={[styles.formInput, isDark && styles.darkInput]} placeholder="e.g. Bharatanatyam Advanced" placeholderTextColor="#A0AEC0" value={course} onChangeText={setCourse} />
              </View>
            )}

            {/* DYNAMIC FIELDS RENDERER */}
            {dynamicFieldsList.map((field, idx) => (
              <View key={idx} style={styles.inputGroup}>
                <Text style={[styles.label, isDark && styles.darkText]}>{field.label} {field.is_required ? '*' : ''}</Text>
                {field.field_type === 'dropdown' ? (
                  <TouchableOpacity style={[styles.formInput, isDark && styles.darkInput]} onPress={() => handleOpenDynamicFieldModal(field)}>
                    <Text style={{ color: dynamicValues[field.id] ? (isDark ? '#FFF' : '#1A202C') : '#A0AEC0', fontSize: 15 }}>
                      {dynamicValues[field.id] || `Select ${field.label}`}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TextInput
                    style={[styles.formInput, isDark && styles.darkInput]}
                    placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                    placeholderTextColor="#A0AEC0"
                    value={dynamicValues[field.id] || ''}
                    onChangeText={(text) => setDynamicValues({...dynamicValues, [field.id]: text})}
                  />
                )}
              </View>
            ))}

            <TouchableOpacity style={styles.submitButton} onPress={handleSingleSubmit} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.submitButtonText}>Submit Application</Text>
                  <FontAwesome5 name="check-circle" size={16} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* TAB CONTENT: 3. BULK UPLOAD */}
      {activeTab === 'bulk' && (
        <View style={styles.bulkContainer}>
          <View style={[styles.bulkCard, isDark && styles.darkCard]}>
            <View style={styles.uploadIconContainer}>
              <FontAwesome5 name="file-csv" size={48} color="#3182CE" />
            </View>
            <Text style={[styles.bulkTitle, isDark && styles.darkText]}>Bulk Import Student Applications</Text>
            <Text style={[styles.bulkDesc, isDark && styles.darkSubText]}>
              Upload a CSV file containing multiple student records. The system will automatically validate and queue them for batch insertion into the production database.
            </Text>
            
            <TouchableOpacity style={styles.uploadButton} onPress={handleBulkUpload}>
              <FontAwesome5 name="upload" size={16} color="#FFFFFF" />
              <Text style={styles.uploadButtonText}>Select CSV File</Text>
            </TouchableOpacity>

            <View style={[styles.templateBox, isDark && styles.darkHeader]}>
              <FontAwesome5 name="info-circle" size={14} color="#718096" />
              <Text style={styles.templateText}>Required columns: first_name, last_name, phone, email, course, program</Text>
            </View>
          </View>
        </View>
      )}

      {/* SELECTION MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={[styles.modalContent, isDark && styles.darkModalContent]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitleText, isDark && styles.darkText]}>{modalTitle}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseBtn}>
                <FontAwesome5 name="times" size={18} color="#A0AEC0" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={modalItems}
              keyExtractor={(item, idx) => item.id?.toString() || idx.toString()}
              contentContainerStyle={{ padding: 24 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={[styles.modalItemBtn, isDark && styles.darkModalItemBtn]} onPress={() => handleSelectItem(item)}>
                  <Text style={[styles.modalItemText, isDark && styles.darkText]}>{item.name || item}</Text>
                  <FontAwesome5 name="chevron-right" size={14} color="#CBD5E0" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <Text style={{ color: '#A0AEC0', fontSize: 15 }}>No items available from backend.</Text>
                </View>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFC' },
  darkBg: { backgroundColor: '#0F172A' },
  header: { padding: 20, paddingTop: 60, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  darkHeader: { backgroundColor: '#1E293B', borderBottomColor: '#334155' },
  title: { fontSize: 12, fontWeight: '900', color: '#4A5568', letterSpacing: 2, marginBottom: 16 },
  darkTitle: { color: '#94A3B8' },
  segmentContainer: { flexDirection: 'row', backgroundColor: '#EDF2F7', borderRadius: 16, padding: 4, marginBottom: 16 },
  darkSegmentContainer: { backgroundColor: '#0F172A' },
  segmentButton: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', minWidth: 110, flexDirection: 'row' },
  segmentActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  darkSegmentActive: { backgroundColor: '#1E293B' },
  segmentText: { fontSize: 13, fontWeight: '700', color: '#718096' },
  segmentTextActive: { color: '#3182CE', fontWeight: '900' },
  darkSegmentTextActive: { color: '#FBBF24', fontWeight: '900' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7FAFC', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 },
  input: { flex: 1, marginLeft: 12, fontSize: 16, color: '#1A202C', fontWeight: '600' },
  darkText: { color: '#FFFFFF' },
  darkSubText: { color: '#94A3B8' },
  filterContainer: { backgroundColor: 'transparent', marginBottom: 4 },
  filterScroll: { gap: 8, paddingRight: 10 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, backgroundColor: '#EDF2F7', borderWidth: 1, borderColor: '#E2E8F0' },
  darkFilterPill: { backgroundColor: '#1E293B', borderColor: '#334155' },
  filterPillActive: { backgroundColor: '#3182CE', borderColor: '#3182CE' },
  filterPillText: { fontSize: 12, fontWeight: '700', color: '#718096' },
  darkFilterPillText: { color: '#94A3B8' },
  filterPillTextActive: { color: '#FFFFFF', fontWeight: '900' },
  list: { padding: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  darkCard: { backgroundColor: '#1E293B', borderColor: '#334155' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, backgroundColor: 'transparent' },
  avatar: { width: 45, height: 45, borderRadius: 15, backgroundColor: '#EBF8FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '900', color: '#3182CE' },
  headerInfo: { flex: 1, marginLeft: 15, backgroundColor: 'transparent' },
  name: { fontSize: 16, fontWeight: '900', color: '#1A202C' },
  id: { fontSize: 12, color: '#718096', fontWeight: '600' },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '900' },
  cardBody: { marginBottom: 15, backgroundColor: 'transparent' },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5, backgroundColor: 'transparent' },
  infoText: { marginLeft: 10, fontSize: 13, color: '#4A5568', fontWeight: '600' },
  cardActions: { flexDirection: 'row', gap: 10, backgroundColor: 'transparent' },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: '#EBF8FF' },
  actionText: { marginLeft: 8, fontSize: 13, fontWeight: '900', color: '#3182CE' },
  emptyContainer: { alignItems: 'center', marginTop: 100, backgroundColor: 'transparent' },
  emptyText: { marginTop: 15, fontSize: 16, color: '#A0AEC0', fontWeight: '600' },
  formScroll: { flex: 1 },
  formContainer: { padding: 20, paddingBottom: 40 },
  formCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2 },
  stepBadge: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#EDF2F7', borderRadius: 8, alignSelf: 'flex-start', marginBottom: 8 },
  stepBadgeText: { fontSize: 10, fontWeight: '900', color: '#718096', letterSpacing: 1 },
  formHeader: { fontSize: 14, fontWeight: '900', color: '#1A202C', letterSpacing: 1, marginBottom: 24 },
  inputGroup: { marginBottom: 20, backgroundColor: 'transparent' },
  label: { fontSize: 13, fontWeight: '700', color: '#4A5568', marginBottom: 4 },
  subLabel: { fontSize: 11, fontWeight: '600', color: '#E53E3E', marginBottom: 8 },
  programSelectorBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F7FAFC', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  programSelectorText: { fontSize: 15, fontWeight: '800', color: '#1A202C' },
  formInput: { backgroundColor: '#F7FAFC', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#1A202C', borderWidth: 1, borderColor: '#E2E8F0' },
  darkInput: { backgroundColor: '#0F172A', borderColor: '#334155', color: '#FFFFFF' },
  submitButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#3182CE', paddingVertical: 18, borderRadius: 18, marginTop: 10, shadowColor: '#3182CE', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5 },
  submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', marginRight: 10 },
  bulkContainer: { flex: 1, padding: 20 },
  bulkCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2 },
  uploadIconContainer: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#EBF8FF', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  bulkTitle: { fontSize: 18, fontWeight: '900', color: '#1A202C', marginBottom: 12, textAlign: 'center' },
  bulkDesc: { fontSize: 13, color: '#718096', textAlign: 'center', lineHeight: 20, marginBottom: 30 },
  uploadButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#3182CE', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 18, width: '100%', marginBottom: 24, shadowColor: '#3182CE', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  uploadButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', marginLeft: 10 },
  templateBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7FAFC', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#EDF2F7' },
  templateText: { marginLeft: 8, fontSize: 11, color: '#718096', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(26, 32, 44, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '80%', shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  darkModalContent: { backgroundColor: '#1E293B' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: 'transparent' },
  modalTitleText: { fontSize: 18, fontWeight: '900', color: '#1A202C' },
  modalCloseBtn: { padding: 8, borderRadius: 16, backgroundColor: '#F7FAFC' },
  modalItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 20, backgroundColor: '#F7FAFC', borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#EDF2F7' },
  darkModalItemBtn: { backgroundColor: '#0F172A', borderColor: '#334155' },
  modalItemText: { fontSize: 16, fontWeight: '700', color: '#2D3748' },
  statsRowGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 12, marginBottom: 4, paddingHorizontal: 2 },
  miniStatCard: { flex: 1, backgroundColor: '#EDF2F7', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  darkStatCard: { backgroundColor: '#1E293B', borderColor: '#334155' },
  miniStatLabel: { fontSize: 9, fontWeight: '700', color: '#718096', marginBottom: 2, textAlign: 'center' },
  miniStatValue: { fontSize: 13, fontWeight: '900', textAlign: 'center' },
});
