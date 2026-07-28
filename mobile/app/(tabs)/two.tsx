import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, FlatList, TextInput, ActivityIndicator,
  TouchableOpacity, Alert, Text, View, useColorScheme, StatusBar
import { FontAwesome5 } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getStudents } from '../../src/api/sales';
import client from '../../src/api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SalesScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  // ── Auth & user ──────────────────────────────────────────────────────────
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<any>(null);

  // ── Pipeline stages ───────────────────────────────────────────────────────
  const [pipelineStages, setPipelineStages] = useState<any[]>([
    { id: 'NEW', name: 'New' },
    { id: 'FOLLOW_UP', name: 'Follow Up' },
    { id: 'PAYMENT_PENDING', name: 'Payment Pending' },
    { id: 'ENROLLED', name: 'Enrolled' },
    { id: 'DROPPED', name: 'Dropped' },
  ]);

  // ── Leads list ────────────────────────────────────────────────────────────
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [totalLeads, setTotalLeads] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  // ── Filters & search ──────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'-id' | 'id'>('-id');
  const [selectedFilter, setSelectedFilter] = useState<any>({ label: 'All', type: 'all', value: 'All' });
  const [showFilters, setShowFilters] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState<'start' | 'end' | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadUser();
    fetchStats();
    fetchPipelineStages();
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const t = setTimeout(() => {
      setLeads([]);
      setCurrentPage(1);
      fetchLeads(1, true);
    }, 300);
    return () => clearTimeout(t);
  }, [search, selectedFilter, sortOrder, startDate, endDate, authLoading, user?.role]);

  const loadUser = async () => {
    try {
      const cached = await AsyncStorage.getItem('userInfo');
      if (cached) setUser(JSON.parse(cached));
      const res = await client.get('/auth/me/');
      if (res.data) {
        setUser(res.data);
        await AsyncStorage.setItem('userInfo', JSON.stringify(res.data));
      }
    } catch (e) {
      console.log('loadUser error:', e);
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await client.get('/crm/dashboard-stats/');
      if (res.data) setStats(res.data);
    } catch (e) {}
  };

  const fetchPipelineStages = async () => {
    try {
      const res = await client.get('/crm/stages/');
      const data = res.data?.results || res.data || [];
      if (data.length > 0) setPipelineStages(data);
    } catch (e) {}
  };

  const fetchLeads = async (page = 1, reset = false) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);

    const isSalesOnly = user?.role === 'SALES';

    const params: any = { page, page_size: PAGE_SIZE, ordering: sortOrder };
    if (search) params.search = search;
    if (selectedFilter.type === 'lead_status') params.lead_status = selectedFilter.value;
    else if (selectedFilter.type === 'upcoming_followups') params.upcoming_followups = 'true';
    if (startDate) params.start_date = startDate.toISOString().split('T')[0];
    if (endDate) params.end_date = endDate.toISOString().split('T')[0];

    // Sales screen should NEVER show converted/enrolled leads, regardless of user role.
    // They belong to the Mentors view now.
    params.hide_converted = 'true';

    const data = await getStudents(params);
    let list = data.results || [];
    
    // ── FRONTEND HARD-FILTER: Absolutely force hide converted leads for EVERYONE on this screen ──
    list = list.filter((item: any) => {
      const raw = item.lead_status || item.status || 'NEW';
      const name = resolveStage(raw).toUpperCase();
      const id = String(raw).toUpperCase();
      return !name.includes('ENROL') && !name.includes('CONVERT') && id !== 'ENROLLED' && id !== 'CONVERTED';
    });

    const count = data.count || list.length;

    setLeads(prev => (reset || page === 1) ? list : [...prev, ...list]);
    setTotalLeads(count);
    setCurrentPage(page);
    setLoading(false);
    setLoadingMore(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchLeads(1, true);
    await fetchStats();
    setRefreshing(false);
  };

  const handleLoadMore = () => {
    if (!loadingMore && leads.length < totalLeads) fetchLeads(currentPage + 1);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const hasAccess = user?.role === 'SALES' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.is_manager;

  const resolveStage = (raw: string): string => {
    if (!raw) return 'New';
    const fixed: Record<string, string> = {
      NEW: 'New', FOLLOW_UP: 'Follow Up', PAYMENT_PENDING: 'Payment Pending',
      ENROLLED: 'Enrolled', DROPPED: 'Dropped', CONTACTED: 'Contacted',
    };
    if (fixed[raw.toUpperCase()]) return fixed[raw.toUpperCase()];
    const match = pipelineStages.find((s: any) => String(s.id) === String(raw) || s.name === raw);
    if (match) return match.name;
    return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const stageStyle = (raw: string) => {
    const s = (raw || '').toUpperCase();
    if (s.includes('ENROL')) return { bg: '#D1FAE5', text: '#065F46', stripe: '#10B981' };
    if (s === 'NEW') return { bg: '#DBEAFE', text: '#1E40AF', stripe: '#3B82F6' };
    if (s.includes('PAYMENT') || s.includes('PENDING')) return { bg: '#FEF3C7', text: '#92400E', stripe: '#F59E0B' };
    if (s.includes('FOLLOW')) return { bg: '#EDE9FE', text: '#5B21B6', stripe: '#8B5CF6' };
    if (s.includes('DROP')) return { bg: '#FEE2E2', text: '#991B1B', stripe: '#EF4444' };
    if (s.includes('CONTACT')) return { bg: '#E0F2FE', text: '#075985', stripe: '#0EA5E9' };
    return { bg: '#F1F5F9', text: '#475569', stripe: '#94A3B8' };
  };

  const isSalesOnly = user?.role === 'SALES';

  const filterOptions = [
    { label: 'All', type: 'all', value: 'All' },
    { label: 'Follow-ups', type: 'upcoming_followups', value: 'true' },
    ...pipelineStages
      .filter((s: any) => {
        // No one should see the converted/enrolled stage filter on the Sales screen
        const n = (s.name || '').toUpperCase();
        const id = (String(s.id) || '').toUpperCase();
        return !n.includes('ENROL') && !n.includes('CONVERT') && id !== 'ENROLLED' && id !== 'CONVERTED';
      })
      .map(s => ({ label: s.name, type: 'lead_status', value: s.id })),
  ];

  // ── Render lead row ───────────────────────────────────────────────────────
  const renderLead = useCallback(({ item }: { item: any }) => {
    const raw = item.lead_status || item.status || 'NEW';
    const ss = stageStyle(raw);
    const stageName = resolveStage(raw);
    const phone = item.phone || item.mobile || '';
    const initials = ((item.first_name?.[0] || '') + (item.last_name?.[0] || '')).toUpperCase() || '?';

    return (
      <TouchableOpacity
        style={[styles.leadRow, isDark && styles.leadRowDark]}
        onPress={() => router.push({ pathname: '/lead-details', params: { leadId: item.id } } as any)}
        activeOpacity={0.6}
      >
        {/* Left stage stripe */}
        <View style={[styles.stripe, { backgroundColor: ss.stripe }]} />

        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: ss.bg }]}>
          <Text style={[styles.avatarTxt, { color: ss.text }]}>{initials}</Text>
        </View>

        {/* Info */}
        <View style={styles.leadInfo}>
          <Text style={[styles.leadName, isDark && { color: '#F1F5F9' }]} numberOfLines={1}>
            {item.first_name} {item.last_name}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.stagePill, { backgroundColor: ss.bg }]}>
              <Text style={[styles.stageTxt, { color: ss.text }]}>{stageName}</Text>
            </View>
            {item.program_name || item.program ? (
              <Text style={styles.program} numberOfLines={1}>{item.program_name || item.program}</Text>
            ) : null}
          </View>
          {phone ? (
            <Text style={[styles.phoneRow, isDark && { color: '#64748B' }]} numberOfLines={1}>
              {phone}
            </Text>
          ) : null}
        </View>

        {/* Call button */}
        <TouchableOpacity
          style={[styles.callBtn, { backgroundColor: isDark ? '#1E3A5F' : '#EFF6FF' }]}
          onPress={() => {
            if (phone) {
              router.push({ pathname: '/dialpad', params: { leadId: item.id, phone } } as any);
            } else {
              Alert.alert('No Phone', 'This lead has no phone number.');
            }
          }}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        >
          <FontAwesome5 name="phone-alt" size={14} color="#3B82F6" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }, [isDark, pipelineStages]);

  // ── Guards ────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <View style={[styles.center, isDark && styles.darkBg]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!hasAccess) {
    return (
      <View style={[styles.center, isDark && styles.darkBg]}>
        <FontAwesome5 name="lock" size={40} color="#CBD5E1" />
        <Text style={{ color: '#94A3B8', marginTop: 12, fontSize: 15, fontWeight: '700' }}>Restricted Access</Text>
        <Text style={{ color: '#94A3B8', marginTop: 4, fontSize: 13, textAlign: 'center' }}>Sales personnel only</Text>
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, isDark && styles.darkBg]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* ── HEADER ── */}
      <View style={[styles.header, isDark && styles.headerDark, { paddingTop: Math.max(insets.top + 8, 16) }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.headerTitle, isDark && { color: '#F1F5F9' }]}>Sales & Admissions</Text>
            <Text style={[styles.headerSub, isDark && { color: '#64748B' }]}>
              {totalLeads > 0 ? `${totalLeads} leads` : 'Loading...'}
            </Text>
          </View>
          {/* Map Folder — call recording, DO NOT CHANGE */}
          <TouchableOpacity
            style={styles.mapBtn}
            onPress={async () => {
              const { selectRecordingFolder } = await import('../../src/utils/CallManager');
              const uri = await selectRecordingFolder();
              if (uri) Alert.alert('Folder Mapped', 'Call recordings will now be scanned from this folder!');
            }}
          >
            <FontAwesome5 name="folder-open" size={13} color="#fff" />
            <Text style={styles.mapBtnTxt}>Map Folder</Text>
          </TouchableOpacity>
        </View>

        {/* Stats row — show to sales so they can see the converted count */}
        {stats && (
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { borderLeftColor: '#3B82F6' }]}>
              <Text style={styles.statVal}>{stats.total_leads || 0}</Text>
              <Text style={styles.statLbl}>Total</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: '#EF4444' }]}>
              <Text style={[styles.statVal, { color: '#EF4444' }]}>{stats.unassigned_leads || 0}</Text>
              <Text style={styles.statLbl}>Unassigned</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: '#10B981' }]}>
              <Text style={[styles.statVal, { color: '#10B981' }]}>{stats.contacted_leads || 0}</Text>
              <Text style={styles.statLbl}>Contacted</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: '#F59E0B' }]}>
              <Text style={[styles.statVal, { color: '#F59E0B' }]}>₹{stats.revenue || 0}</Text>
              <Text style={styles.statLbl}>Revenue</Text>
            </View>
          </View>
        )}

        {/* Search bar */}
        <View style={[styles.searchBar, isDark && styles.searchBarDark]}>
          <FontAwesome5 name="search" size={14} color="#94A3B8" style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, isDark && { color: '#F1F5F9' }]}
            placeholder="Search leads by name or phone..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={t => { setSearch(t); setCurrentPage(1); }}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <FontAwesome5 name="times-circle" size={15} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter controls row */}
        <View style={styles.controlRow}>
          <TouchableOpacity
            style={[styles.controlBtn, showFilters && { backgroundColor: '#3B82F6' }]}
            onPress={() => setShowFilters(f => !f)}
          >
            <FontAwesome5 name="filter" size={11} color={showFilters ? '#fff' : '#64748B'} />
            <Text style={[styles.controlTxt, showFilters && { color: '#fff' }]}>Filter</Text>
            {selectedFilter.type !== 'all' && (
              <View style={styles.filterDot} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => setSortOrder(p => p === '-id' ? 'id' : '-id')}
          >
            <FontAwesome5 name={sortOrder === '-id' ? 'sort-amount-down' : 'sort-amount-up'} size={11} color="#64748B" />
            <Text style={styles.controlTxt}>{sortOrder === '-id' ? 'Newest' : 'Oldest'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlBtn, (startDate || endDate) && { backgroundColor: '#3B82F6' }]}
            onPress={() => setShowPicker('start')}
          >
            <FontAwesome5 name="calendar-alt" size={11} color={(startDate || endDate) ? '#fff' : '#64748B'} />
            <Text style={[styles.controlTxt, (startDate || endDate) && { color: '#fff' }]}>
              {startDate && endDate ? `${startDate.toLocaleDateString('en-GB', {day:'2-digit', month:'short'})} - ${endDate.toLocaleDateString('en-GB', {day:'2-digit', month:'short'})}` : (startDate ? 'Start Date Set' : 'Dates')}
            </Text>
            {(startDate || endDate) && (
              <TouchableOpacity onPress={() => { setStartDate(null); setEndDate(null); setCurrentPage(1); }} style={{ marginLeft: 4 }}>
                <FontAwesome5 name="times-circle" size={11} color="#fff" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {selectedFilter.type !== 'all' && (
            <View style={styles.activeFilter}>
              <Text style={styles.activeFilterTxt}>{selectedFilter.label}</Text>
              <TouchableOpacity onPress={() => { setSelectedFilter({ label: 'All', type: 'all', value: 'All' }); setCurrentPage(1); }}>
                <FontAwesome5 name="times" size={9} color="#3B82F6" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Expandable filter pills */}
        {showFilters && (
          <View style={styles.pillsWrap}>
            {filterOptions.map((f, i) => {
              const active = selectedFilter.type === f.type && selectedFilter.value === f.value;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.pill, active && styles.pillActive, isDark && !active && styles.pillDark]}
                  onPress={() => { setSelectedFilter(f); setCurrentPage(1); setShowFilters(false); }}
                >
                  <Text style={[styles.pillTxt, active && styles.pillTxtActive, isDark && !active && { color: '#94A3B8' }]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {showPicker && (
          <DateTimePicker
            value={showPicker === 'start' ? (startDate || new Date()) : (endDate || new Date())}
            mode="date"
            display="default"
            onChange={(event, date) => {
              if (event.type === 'dismissed') {
                setShowPicker(null);
                return;
              }
              if (date) {
                if (showPicker === 'start') {
                  setStartDate(date);
                  setShowPicker('end'); // Ask for end date next
                } else {
                  setEndDate(date);
                  setShowPicker(null);
                }
              }
            }}
          />
        )}
      </View>

      {/* ── LEADS LIST ── */}
      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={{ color: '#94A3B8', marginTop: 10, fontSize: 13 }}>Loading leads...</Text>
        </View>
      ) : (
        <FlatList
          data={leads}
          renderItem={renderLead}
          keyExtractor={(item, i) => item.id?.toString() || i.toString()}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          getItemLayout={(_, i) => ({ length: 55, offset: 55 * i, index: i })}
          ListEmptyComponent={
            <View style={styles.center}>
              <FontAwesome5 name="inbox" size={36} color="#CBD5E1" />
              <Text style={{ color: '#94A3B8', marginTop: 10, fontSize: 14, fontWeight: '600' }}>No leads found</Text>
              {search ? <Text style={{ color: '#CBD5E1', fontSize: 12, marginTop: 4 }}>Try a different search</Text> : null}
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#3B82F6" />
              </View>
            ) : leads.length >= totalLeads && leads.length > 0 ? (
              <Text style={{ textAlign: 'center', color: '#CBD5E1', fontSize: 12, padding: 16 }}>
                All {totalLeads} leads loaded
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

// ── STYLES ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  darkBg: { backgroundColor: '#0F172A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },

  // Header
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  headerDark: { backgroundColor: '#1E293B', borderBottomColor: '#334155' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: '#94A3B8', fontWeight: '600', marginTop: 1 },

  // Map Folder (call recording)
  mapBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F59E0B', paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20,
  },
  mapBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 8, borderLeftWidth: 3,
  },
  statVal: { fontSize: 15, fontWeight: '900', color: '#1E293B' },
  statLbl: { fontSize: 9, fontWeight: '700', color: '#94A3B8', marginTop: 1, textTransform: 'uppercase' },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F1F5F9', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 6,
    marginBottom: 6, borderWidth: 1, borderColor: '#E2E8F0',
  },
  searchBarDark: { backgroundColor: '#0F172A', borderColor: '#334155' },
  searchInput: { flex: 1, fontSize: 14, color: '#1E293B', fontWeight: '500' },

  // Controls
  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  controlBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, position: 'relative',
  },
  controlTxt: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  filterDot: {
    position: 'absolute', top: 3, right: 3,
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#F59E0B',
  },
  activeFilter: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#BFDBFE',
  },
  activeFilterTxt: { fontSize: 11, fontWeight: '800', color: '#3B82F6' },

  // Filter pills
  pillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 4 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0',
  },
  pillDark: { backgroundColor: '#1E293B', borderColor: '#334155' },
  pillActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  pillTxt: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  pillTxtActive: { color: '#FFFFFF' },

  // List
  listContent: { paddingVertical: 4 },

  // Lead row
  leadRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 6, paddingRight: 10,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    minHeight: 55,
  },
  leadRowDark: { backgroundColor: '#1E293B', borderBottomColor: '#334155' },
  stripe: { width: 4, alignSelf: 'stretch', borderRadius: 0 },
  avatar: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 10, flexShrink: 0,
  },
  avatarTxt: { fontSize: 13, fontWeight: '900' },
  leadInfo: { flex: 1, marginRight: 8 },
  leadName: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  stagePill: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
  },
  stageTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
  program: { fontSize: 10, color: '#F59E0B', fontWeight: '700', flexShrink: 1 },
  phoneRow: { fontSize: 11, color: '#94A3B8', marginTop: 3, fontWeight: '500' },

  // Call button
  callBtn: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
});
