import React, { ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, TextInputProps, TouchableOpacity, View } from 'react-native';
import s, { BAD, BAD_TINT, MUTED, OK, OK_TINT, GREEN, GREEN_TINT, WARN, WARN_TINT } from '../../styles/styles';

export const Section = ({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) => (
  <View style={s.section}>
    {(title || right) && (
      <View style={[s.rowBetween, { marginBottom: 10 }]}>
        {!!title && <Text style={[s.heading, { marginBottom: 0 }]}>{title}</Text>}
        {right}
      </View>
    )}
    {children}
  </View>
);

export const Stat = ({ t, v, tone }: { t: string; v: string | number; tone?: 'ok' | 'bad' | 'warn' }) => (
  <View style={s.stat}>
    <Text style={s.small}>{t}</Text>
    <Text style={[s.statValue, tone === 'ok' && { color: OK }, tone === 'bad' && { color: BAD }, tone === 'warn' && { color: WARN }]}>
      {v}
    </Text>
  </View>
);

export const EmptyState = ({ text }: { text: string }) => (
  <View style={s.empty}>
    <Text style={s.emptyText}>{text}</Text>
  </View>
);

export const Loading = ({ text = 'Loading…' }: { text?: string }) => (
  <View style={s.center}>
    <ActivityIndicator size="large" color={GREEN} />
    <Text style={s.muted}>{text}</Text>
  </View>
);

export const ErrorState = ({ text, onRetry }: { text: string; onRetry?: () => void }) => (
  <View style={s.center}>
    <Text style={[s.danger, { textAlign: 'center' }]}>{text}</Text>
    {onRetry && (
      <TouchableOpacity style={[s.secondary, { paddingHorizontal: 24, alignSelf: 'center' }]} onPress={onRetry}>
        <Text style={s.secondaryText}>Retry</Text>
      </TouchableOpacity>
    )}
  </View>
);

export const Button = ({
  title,
  onPress,
  kind = 'primary',
  busy,
  disabled,
  fullWidth = true,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}) => {
  const style = kind === 'primary' ? s.primary : kind === 'danger' ? s.dangerBtn : s.secondary;
  const text = kind === 'primary' ? s.primaryText : kind === 'danger' ? s.dangerText : s.secondaryText;
  return (
    <TouchableOpacity
      style={[style, fullWidth ? s.buttonFullWidth : s.buttonInline, (busy || disabled) && s.disabled]}
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {busy ? <ActivityIndicator color={kind === 'primary' ? '#fff' : GREEN} /> : <Text style={[text, s.buttonLabel]}>{title}</Text>}
    </TouchableOpacity>
  );
};

export const SmallButton = ({ title, onPress, danger }: { title: string; onPress: () => void; danger?: boolean }) => (
  <TouchableOpacity
    style={[s.smallBtn, danger && { borderColor: BAD }]}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={title}
  >
    <Text style={[s.smallBtnText, danger && { color: BAD }]}>{title}</Text>
  </TouchableOpacity>
);

export const Chip = ({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) => (
  <TouchableOpacity
    style={[s.chip, active && s.chipActive]}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: !!active }}
  >
    <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
  </TouchableOpacity>
);

const TONES = {
  ok: [OK_TINT, OK],
  warn: [WARN_TINT, WARN],
  bad: [BAD_TINT, BAD],
  info: [GREEN_TINT, GREEN],
  muted: ['#ececf1', MUTED],
} as const;
export const Badge = ({ text, tone = 'info' }: { text: string; tone?: keyof typeof TONES }) => (
  <View style={[s.badge, { backgroundColor: TONES[tone][0] }]}>
    <Text style={[s.badgeText, { color: TONES[tone][1] }]}>{text}</Text>
  </View>
);

export const Field = ({ label, ...props }: { label: string } & TextInputProps) => (
  <View>
    <Text style={s.label}>{label}</Text>
    <TextInput style={[s.input, props.multiline && s.inputMulti]} placeholderTextColor="#9a96ad" autoCapitalize="none" {...props} />
  </View>
);

export const Sheet = ({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable style={s.modalWrap} onPress={onClose}>
      <Pressable style={s.modalCard} onPress={() => undefined}>
        <View style={s.rowBetween}>
          <Text style={[s.heading, { marginBottom: 0, flexShrink: 1 }]}>{title}</Text>
          <SmallButton title="Close" onPress={onClose} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </Pressable>
    </Pressable>
  </Modal>
);

export const ProgressBar = ({ ratio }: { ratio: number }) => (
  <View style={s.barTrack}>
    <View style={[s.barFill, { width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }]} />
  </View>
);
