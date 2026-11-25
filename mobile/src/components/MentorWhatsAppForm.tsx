// Mentor WhatsApp logging form, shown inside the Mentors tab student sheet.
//  - MentorWhatsAppForm: outcome chips, mm:ss duration (WhatsApp call: connected only), notes, follow-up date
// It only collects input; the screen saves via addStudentFeedback (see src/utils/whatsappMentor.ts).
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  WA_OUTCOMES, WA_GREEN_DARK, WaOutcomeKey, parseMmSs,
} from '../utils/whatsappMentor';

const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const displayDate = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export interface WhatsAppFormValues {
  outcome: WaOutcomeKey;
  notes: string;
  durationSec: number;
  followupYMD: string | null;
}

interface FormProps {
  isDark: boolean;
  saving: boolean;
  onSubmit: (values: WhatsAppFormValues) => void;
}

export default function MentorWhatsAppForm({ isDark, saving, onSubmit }: FormProps) {
  const s = useMemo(() => makeStyles(isDark), [isDark]);
  const [outcome, setOutcome] = useState<WaOutcomeKey>('SENT');
  const [notes, setNotes] = useState('');
  const [duration, setDuration] = useState('');
  const [followup, setFollowup] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState('');

  const needsDuration = outcome === 'CALL_CONNECTED';

  const submit = () => {
    let durationSec = 0;
    if (needsDuration) {
      const parsed = parseMmSs(duration);
      if (parsed === null || parsed <= 0) {
        setError('Enter the call length as mm:ss, e.g. 4:30');
        return;
      }
      durationSec = parsed;
    }
    setError('');
    onSubmit({ outcome, notes, durationSec, followupYMD: followup ? toYMD(followup) : null });
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={s.label}>WhatsApp outcome *</Text>
      <View style={s.pillsWrap}>
        {WA_OUTCOMES.map(o => {
          const active = outcome === o.key;
          return (
            <TouchableOpacity
              key={o.key}
              style={[s.pill, active && s.pillActive]}
              onPress={() => { setOutcome(o.key); setError(''); }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              {o.isCall ? (
                <FontAwesome5 name="phone-alt" size={10} color={active ? '#fff' : WA_GREEN_DARK} style={{ marginRight: 5 }} />
              ) : null}
              <Text style={[s.pillTxt, active && s.pillTxtActive]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {needsDuration ? (
        <>
          <Text style={s.label}>Call length (mm:ss) *</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. 4:30"
            placeholderTextColor="#94A3B8"
            value={duration}
            onChangeText={(t) => { setDuration(t); setError(''); }}
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            maxLength={8}
          />
        </>
      ) : null}

      <Text style={s.label}>Notes</Text>
      <TextInput
        style={s.textArea}
        placeholder="What was discussed?"
        placeholderTextColor="#94A3B8"
        value={notes}
        onChangeText={setNotes}
        multiline
        textAlignVertical="top"
      />

      <Text style={s.label}>Next follow-up</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity style={[s.controlBtn, followup && { backgroundColor: WA_GREEN_DARK }]} onPress={() => setShowPicker(true)}>
          <FontAwesome5 name="calendar-alt" size={11} color={followup ? '#fff' : '#64748B'} />
          <Text style={[s.controlTxt, followup && { color: '#fff' }]}>{followup ? displayDate(followup) : 'Select date'}</Text>
        </TouchableOpacity>
        {followup ? (
          <TouchableOpacity onPress={() => setFollowup(null)} accessibilityLabel="Clear follow-up date">
            <FontAwesome5 name="times-circle" size={15} color="#94A3B8" />
          </TouchableOpacity>
        ) : null}
      </View>
      {showPicker ? (
        <DateTimePicker
          value={followup || new Date()}
          mode="date"
          display="default"
          minimumDate={new Date()}
          onChange={(event: any, date?: Date) => {
            setShowPicker(Platform.OS === 'ios');
            if (event.type !== 'dismissed' && date) setFollowup(date);
          }}
        />
      ) : null}

      {error ? <Text style={s.error}>{error}</Text> : null}

      <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : (
          <>
            <FontAwesome5 name="whatsapp" size={15} color="#fff" />
            <Text style={s.saveTxt}>Save WhatsApp log</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (isDark: boolean) => {
  const T = isDark
    ? { chip: '#334155', border: '#334155', input: '#0F172A', text: '#F1F5F9', muted: '#94A3B8' }
    : { chip: '#F1F5F9', border: '#E2E8F0', input: '#F1F5F9', text: '#1E293B', muted: '#64748B' };
  return StyleSheet.create({
    label: { fontSize: 12, fontWeight: '800', color: '#64748B', marginTop: 10, marginBottom: 8 },
    pillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 4 },
    pill: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
      backgroundColor: T.chip, borderWidth: 1, borderColor: T.border,
    },
    pillActive: { backgroundColor: WA_GREEN_DARK, borderColor: WA_GREEN_DARK },
    pillTxt: { fontSize: 12, fontWeight: '700', color: T.muted },
    pillTxtActive: { color: '#FFFFFF' },
    input: {
      borderWidth: 1, borderColor: T.border, backgroundColor: T.input, borderRadius: 12,
      paddingHorizontal: 12, paddingVertical: 10, color: T.text, fontSize: 14,
    },
    textArea: {
      minHeight: 90, borderWidth: 1, borderColor: T.border, backgroundColor: T.input,
      borderRadius: 12, padding: 12, color: T.text, fontSize: 14,
    },
    controlBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: T.chip,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    },
    controlTxt: { fontSize: 12, fontWeight: '700', color: T.muted },
    error: { color: '#EF4444', fontSize: 12, fontWeight: '600', marginTop: 10 },
    saveBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      paddingVertical: 12, borderRadius: 12, minHeight: 46, backgroundColor: WA_GREEN_DARK, marginTop: 18,
    },
    saveTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  });
};
