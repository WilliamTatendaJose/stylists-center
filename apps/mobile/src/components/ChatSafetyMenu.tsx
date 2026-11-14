import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MoreVertical } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { space } from '@sc/tokens';
import type { ChatSafetyDto, ReportConversationInput } from '@sc/shared';
import { Button, Pressable, RadioCard, Sheet, Text, useTheme } from '@sc/ui';
import { apiFetch } from '../api/client.js';
import { describeError } from '../api/errorMessage.js';

const styles = StyleSheet.create({
  action: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { marginBottom: space.s },
  body: { marginBottom: space.l },
  options: { gap: space.s, marginBottom: space.l },
  actions: { gap: space.s },
  notice: { textAlign: 'center' },
});

const REASONS: { value: ReportConversationInput['reason']; title: string; description: string }[] =
  [
    { value: 'misconduct', title: 'Rude or abusive', description: 'Insults, harassment or spam.' },
    { value: 'safety', title: 'I feel unsafe', description: 'Threats or anything dangerous.' },
    { value: 'other', title: 'Something else', description: 'Anything else staff should see.' },
  ];

const safetyKey = (conversationId: string) => ['chat', 'safety', conversationId] as const;

/** Whether either person in the chat has blocked the other. */
export function useChatSafety(conversationId: string | null) {
  return useQuery({
    enabled: conversationId !== null,
    queryKey: safetyKey(conversationId ?? ''),
    queryFn: () => apiFetch<ChatSafetyDto>(`/v1/conversations/${String(conversationId)}/safety`),
  });
}

/**
 * The chat's ⋮ menu: report the other person to staff, and block or unblock
 * them. Stores require both wherever people can message each other.
 */
export function ChatSafetyMenu({
  conversationId,
  name,
}: {
  conversationId: string | null;
  name: string;
}) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { data: safety } = useChatSafety(conversationId);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportConversationInput['reason'] | null>(null);
  const [reported, setReported] = useState(false);

  const report = useMutation({
    mutationFn: (input: ReportConversationInput) =>
      apiFetch<void>(`/v1/conversations/${String(conversationId)}/report`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => setReported(true),
  });
  const toggleBlock = useMutation({
    mutationFn: (block: boolean) =>
      apiFetch<ChatSafetyDto>(`/v1/conversations/${String(conversationId)}/block`, {
        method: block ? 'POST' : 'DELETE',
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(safetyKey(conversationId ?? ''), next);
      setOpen(false);
    },
  });

  if (!conversationId) return null;
  const blockedByMe = safety?.blockedByMe ?? false;
  const busy = report.isPending || toggleBlock.isPending;
  const error = report.error ?? toggleBlock.error;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Report or block"
        onPress={() => {
          setReason(null);
          setReported(false);
          report.reset();
          toggleBlock.reset();
          setOpen(true);
        }}
        style={styles.action}
      >
        <MoreVertical size={21} color={colors.text} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <Text variant="cardTitle" style={styles.title}>
          Report or block {name}
        </Text>
        {reported ? (
          <Text variant="body" color="neutral700" style={styles.body}>
            Thanks. StylistsCenter staff will review this chat. You can also block {name} so they
            can&apos;t message you.
          </Text>
        ) : (
          <>
            <Text variant="body" color="neutral700" style={styles.body}>
              Tell StylistsCenter staff what went wrong. {name} isn&apos;t told who reported them.
            </Text>
            <View style={styles.options}>
              {REASONS.map((option) => (
                <RadioCard
                  key={option.value}
                  title={option.title}
                  description={option.description}
                  dot
                  selected={reason === option.value}
                  onPress={() => setReason(option.value)}
                />
              ))}
            </View>
          </>
        )}
        {error ? (
          <Text variant="meta" color="accent700" accessibilityRole="alert" style={styles.body}>
            {describeError(error, 'Something went wrong. Try again.')}
          </Text>
        ) : null}
        <View style={styles.actions}>
          {reported ? null : (
            <Button
              label={report.isPending ? 'Sending…' : 'Send report'}
              block
              disabled={busy || reason === null}
              onPress={() => {
                if (reason) report.mutate({ reason });
              }}
            />
          )}
          <Button
            label={blockedByMe ? `Unblock ${name}` : `Block ${name}`}
            variant="secondary"
            block
            disabled={busy}
            onPress={() => toggleBlock.mutate(!blockedByMe)}
          />
        </View>
      </Sheet>
    </>
  );
}

/** Shown instead of the message box when either person has blocked the other. */
export function BlockedNotice({ blockedByMe, name }: { blockedByMe: boolean; name: string }) {
  return (
    <Text variant="meta" color="neutral700" style={styles.notice}>
      {blockedByMe
        ? `You blocked ${name}. Unblock them from the ⋮ menu to message them.`
        : "You can't send messages in this chat."}
    </Text>
  );
}
