import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Pencil } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { RichText } from '@/components/shared/RichText';
import { Toast } from '@/components/shared/Toast';
import {
  buildMentionItems,
  type MentionItem,
} from '@/components/editor/mentionItems';
import { useCharacters } from '@/hooks/useCharacters';
import { useLocations } from '@/hooks/useLocations';
import { useToneAndContent } from '@/hooks/useToneAndContent';
import { useCanEdit } from '@/hooks/useRole';
import { useAppStore } from '@/stores/appStore';
import { useT } from '@/i18n';
import { hasHtmlText } from '@/lib/timeline/timelineRange';

/**
 * The table's shared agreement — Concept, Aim, Tone, Subject matter, written as
 * headings inside one editor (and the Content panel on the
 * steading and GM playbooks, which a wiki collapses into one record).
 *
 * The only page in the app every role can read and player+GM can write. No GM
 * accent anywhere: a boundary anyone may set must not look like the GM's.
 */
export default function ToneAndContentPage() {
  const t = useT();
  const navigate = useNavigate();
  const canEdit = useCanEdit();
  const session = useAppStore((s) => s.session);
  const spaceId = session?.space.id;
  const { record, loaded, updateNotes } = useToneAndContent(spaceId);
  const [editing, setEditing] = useState(false);

  const { characters } = useCharacters(spaceId);
  const { locations } = useLocations(spaceId);

  // Mention targets — the agreements name people and places.
  const mentionItems = useMemo<MentionItem[]>(
    () => buildMentionItems(characters, locations),
    [characters, locations],
  );

  // Every other page pairs this render guard with a redirect effect — a
  // session-less deep link must not sit on a page frozen blank forever.
  useEffect(() => {
    if (!session) navigate('/');
  }, [session, navigate]);

  if (!session) return null;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mb-10"
        >
          <div className="flex items-start gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 -ml-2 sm:mt-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
              title={t('character.backToGrimoire')}
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-4xl sm:text-5xl font-bold text-[var(--text-primary)] leading-none">
                {t('toneAndContent.title')}
              </h1>
              <p className="label-overline mt-4">{t('toneAndContent.overline')}</p>
              {/* The how-to sits with the masthead, not stacked inside the
                  record: the card below holds what the table agreed and
                  nothing else. */}
              <p className="mt-3 max-w-lg text-xs text-[var(--text-muted)] font-body">
                {t('toneAndContent.hint')}
              </p>
              {!canEdit && (
                <p className="label-overline mt-3">{t('toneAndContent.readOnly')}</p>
              )}
            </div>
            {/* Same slot and same row as every sheet's Edit (fiche perso/lieu)
                — a page with one record has no card-level action to speak of,
                and left in the card the button sat alone above the hint. */}
            {canEdit && (
              <button
                onClick={() => setEditing((v) => !v)}
                className={`${editing ? 'btn-ink' : 'btn-outline'} text-sm flex-shrink-0 sm:mt-1.5`}
              >
                {editing ? <Check size={14} /> : <Pencil size={14} />}
                {t(editing ? 'common.save' : 'common.edit')}
              </button>
            )}
          </div>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="card-paper p-6"
        >
          {loaded && !hasHtmlText(record.notes) && !editing ? (
            <p className="text-[var(--text-muted)] font-body text-sm">
              {t('toneAndContent.empty')}
            </p>
          ) : (
            <RichText
              content={record.notes}
              onChange={updateNotes}
              editable={canEdit && editing}
              mentionItems={mentionItems}
            />
          )}
        </motion.section>
      </main>
      <Toast />
    </div>
  );
}
