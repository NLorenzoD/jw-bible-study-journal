'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input, Select, Textarea } from '@/components/shared/inputs';
import { fetchLinkMetadata } from '@/lib/firebase/link-metadata';
import { useEntitlement } from '@/lib/hooks/useEntitlement';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { db } from '@/lib/store/db';
import {
  addLinkReference,
  addProject,
  addQuestion,
  createId,
  deleteLinkReference,
  deleteProject,
  updateProject,
  updateQuestion
} from '@/lib/store/repository';
import { LinkReference, QuestionStatus, StudyProject, StudyQuestion } from '@/lib/types';

interface LinkActionResult {
  ok: boolean;
  message?: string;
}

const ALL_PROJECTS_VALUE = '__all_projects__';

type QuestionFilter = 'all' | QuestionStatus;

const QUESTION_FILTER_OPTIONS: Array<{ value: QuestionFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'answered', label: 'Answered' }
];

function normalizeResearchUrl(raw: string) {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function getLinkDisplayTitle(link: LinkReference) {
  if (link.title?.trim()) {
    return link.title.trim();
  }

  try {
    return new URL(link.url).hostname.replace(/^www\./i, '');
  } catch {
    return 'Research source';
  }
}

export default function ProjectsPage() {
  const { userId, householdId } = useUserContext();
  const { hasPaidAccess: canUseAdvancedFilters } = useEntitlement();

  const projects = useLiveQuery(
    () => db.projects.where('user_id').equals(userId).and((project) => !project.archived).reverse().sortBy('updated_at'),
    [userId],
    []
  );
  const projectsByTitle = useMemo(
    () =>
      [...projects].sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })),
    [projects]
  );
  const projectIds = useMemo(() => projectsByTitle.map((project) => project.id), [projectsByTitle]);
  const projectIdSet = useMemo(() => new Set(projectIds), [projectIds]);

  const [selectedProjectId, setSelectedProjectId] = useState<string>(ALL_PROJECTS_VALUE);
  const [questionProjectChoice, setQuestionProjectChoice] = useState<string>('__new__');
  const [newQuestionProjectTitle, setNewQuestionProjectTitle] = useState('');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [inlineQuestionDrafts, setInlineQuestionDrafts] = useState<Record<string, string>>({});
  const [submittingQuestionTarget, setSubmittingQuestionTarget] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectTitle, setEditingProjectTitle] = useState('');
  const [savingProjectTitleId, setSavingProjectTitleId] = useState<string | null>(null);
  const isAllProjectsSelected = selectedProjectId === ALL_PROJECTS_VALUE;
  const isProjectFilteringActive = canUseAdvancedFilters && !isAllProjectsSelected;

  useEffect(() => {
    if (selectedProjectId === ALL_PROJECTS_VALUE) {
      return;
    }
    const exists = projectsByTitle.some((project) => project.id === selectedProjectId);
    if (!exists) {
      setSelectedProjectId(ALL_PROJECTS_VALUE);
    }
  }, [projectsByTitle, selectedProjectId]);

  useEffect(() => {
    if (questionProjectChoice === '__new__') {
      return;
    }
    if (!projectsByTitle.some((project) => project.id === questionProjectChoice)) {
      setQuestionProjectChoice('__new__');
    }
  }, [projectsByTitle, questionProjectChoice]);

  useEffect(() => {
    if (!expandedProjectId) {
      return;
    }
    if (!projectsByTitle.some((project) => project.id === expandedProjectId)) {
      setExpandedProjectId(null);
    }
  }, [expandedProjectId, projectsByTitle]);

  useEffect(() => {
    if (!editingProjectId) {
      return;
    }
    const existing = projectsByTitle.find((project) => project.id === editingProjectId);
    if (!existing) {
      setEditingProjectId(null);
      setEditingProjectTitle('');
      return;
    }
    if (!savingProjectTitleId) {
      setEditingProjectTitle(existing.title);
    }
  }, [editingProjectId, projectsByTitle, savingProjectTitleId]);

  const questions = useLiveQuery(
    async () => {
      const allUserQuestions = await db.questions.where('user_id').equals(userId).toArray();

      if (!isProjectFilteringActive) {
        return allUserQuestions
          .filter((question) => projectIdSet.has(question.project_id))
          .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
      }

      return allUserQuestions
        .filter((question) => question.project_id === selectedProjectId)
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    },
    [isProjectFilteringActive, projectIdSet, selectedProjectId, userId],
    []
  );
  const questionLinks = useLiveQuery(
    () =>
      db.linkReferences
        .where('parent_type')
        .equals('question')
        .and((link) => link.user_id === userId)
        .toArray(),
    [userId],
    []
  );
  const linksByQuestion = useMemo(() => {
    const map = new Map<string, LinkReference[]>();
    for (const link of questionLinks) {
      const current = map.get(link.parent_id) ?? [];
      current.push(link);
      map.set(link.parent_id, current);
    }

    for (const links of map.values()) {
      links.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    }

    return map;
  }, [questionLinks]);
  const [questionFilter, setQuestionFilter] = useState<QuestionFilter>('all');

  const allQuestions = useMemo(() => questions ?? [], [questions]);
  const questionCounts = useMemo(() => {
    const counts: Record<QuestionStatus, number> = {
      open: 0,
      in_progress: 0,
      answered: 0
    };

    for (const question of allQuestions) {
      counts[question.status] += 1;
    }

    return counts;
  }, [allQuestions]);
  const visibleQuestions = useMemo(() => {
    if (!canUseAdvancedFilters || questionFilter === 'all') {
      return allQuestions;
    }
    return allQuestions.filter((question) => question.status === questionFilter);
  }, [allQuestions, canUseAdvancedFilters, questionFilter]);
  const visibleQuestionsByProject = useMemo(() => {
    const map = new Map<string, StudyQuestion[]>();
    for (const question of visibleQuestions) {
      const current = map.get(question.project_id) ?? [];
      current.push(question);
      map.set(question.project_id, current);
    }

    for (const groupedQuestions of map.values()) {
      groupedQuestions.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    }

    return map;
  }, [visibleQuestions]);
  const projectQuestionStats = useMemo(() => {
    const stats = new Map<string, { all: number; open: number; inProgress: number; answered: number }>();
    for (const question of allQuestions) {
      const current = stats.get(question.project_id) ?? { all: 0, open: 0, inProgress: 0, answered: 0 };
      current.all += 1;
      if (question.status === 'open') {
        current.open += 1;
      } else if (question.status === 'in_progress') {
        current.inProgress += 1;
      } else if (question.status === 'answered') {
        current.answered += 1;
      }
      stats.set(question.project_id, current);
    }
    return stats;
  }, [allQuestions]);

  async function addQuestionToProject(projectId: string, questionText: string) {
    if (!questionText.trim()) {
      return;
    }

    await addQuestion({
      id: createId(),
      user_id: userId,
      household_id: householdId,
      project_id: projectId,
      question: questionText.trim(),
      status: 'open',
      notes: '',
      conclusion: '',
      shareable_insight: '',
      is_conflict_copy: false,
      conflict_of: null
    });
  }

  async function submitProjectQuestion(event: FormEvent) {
    event.preventDefault();
    if (!newQuestionText.trim()) {
      return;
    }

    setSubmittingQuestionTarget(questionProjectChoice);
    let targetProjectId = questionProjectChoice;
    try {
      if (questionProjectChoice === '__new__') {
        const title = newQuestionProjectTitle.trim();
        if (!title) {
          return;
        }

        const project = await addProject({
          id: createId(),
          user_id: userId,
          household_id: householdId,
          title,
          description: '',
          archived: false
        });
        targetProjectId = project.id;
        setSelectedProjectId(project.id);
        setExpandedProjectId(project.id);
        setQuestionProjectChoice(project.id);
        setNewQuestionProjectTitle('');
      }

      await addQuestionToProject(targetProjectId, newQuestionText);
      setExpandedProjectId(targetProjectId);
      setNewQuestionText('');
    } finally {
      setSubmittingQuestionTarget(null);
    }
  }

  async function submitInlineQuestion(projectId: string) {
    const draft = inlineQuestionDrafts[projectId]?.trim() ?? '';
    if (!draft) {
      return;
    }

    setSubmittingQuestionTarget(projectId);
    try {
      await addQuestionToProject(projectId, draft);
      setInlineQuestionDrafts((current) => ({ ...current, [projectId]: '' }));
      setExpandedProjectId(projectId);
    } finally {
      setSubmittingQuestionTarget(null);
    }
  }

  async function patchQuestion(
    questionId: string,
    patch: { question?: string; status?: QuestionStatus; notes?: string; conclusion?: string; shareable_insight?: string }
  ) {
    await updateQuestion(questionId, patch);
  }

  async function addQuestionLink(questionId: string, rawUrl: string): Promise<LinkActionResult> {
    const normalizedUrl = normalizeResearchUrl(rawUrl);
    if (!normalizedUrl) {
      return { ok: false, message: 'Enter a valid internet link.' };
    }

    const duplicate = await db.linkReferences
      .where('parent_id')
      .equals(questionId)
      .and((link) => link.parent_type === 'question' && link.url.toLowerCase() === normalizedUrl.toLowerCase())
      .first();

    if (duplicate) {
      return { ok: false, message: 'This link is already attached.' };
    }

    const metadata = await fetchLinkMetadata(normalizedUrl);
    await addLinkReference({
      id: createId(),
      user_id: userId,
      household_id: householdId,
      parent_type: 'question',
      parent_id: questionId,
      shared_to_household: false,
      url: normalizedUrl,
      title: metadata?.title,
      publication_name: metadata?.publication_name,
      section_heading: metadata?.section_heading
    });

    return { ok: true };
  }

  async function removeQuestionLink(linkId: string) {
    await deleteLinkReference(linkId);
  }

  function beginProjectTitleEdit(project: StudyProject) {
    setEditingProjectId(project.id);
    setEditingProjectTitle(project.title);
  }

  function cancelProjectTitleEdit() {
    setEditingProjectId(null);
    setEditingProjectTitle('');
  }

  async function saveProjectTitle(projectId: string) {
    const nextTitle = editingProjectTitle.trim();
    if (!nextTitle) {
      return;
    }

    setSavingProjectTitleId(projectId);
    try {
      await updateProject(projectId, { title: nextTitle });
      setEditingProjectId(null);
      setEditingProjectTitle('');
    } finally {
      setSavingProjectTitleId(null);
    }
  }

  async function requestProjectDelete(project: StudyProject, questionCount: number) {
    const questionWord = questionCount === 1 ? 'question' : 'questions';
    const firstConfirmation = window.confirm(
      `Delete "${project.title}" permanently?\n\nThis will remove this project${
        questionCount > 0 ? `, ${questionCount} ${questionWord}, and attached research links` : ''
      } from your account and synced devices.\n\nThis action cannot be recovered.`
    );
    if (!firstConfirmation) {
      return;
    }

    const finalConfirmation = window.confirm(
      'Final warning: once deleted, this project and all related data cannot be recovered.\n\nPress OK to permanently delete.'
    );
    if (!finalConfirmation) {
      return;
    }

    setDeletingProjectId(project.id);
    try {
      await deleteProject(project.id);
      setInlineQuestionDrafts((current) => {
        const next = { ...current };
        delete next[project.id];
        return next;
      });

      if (expandedProjectId === project.id) {
        setExpandedProjectId(null);
      }
      if (editingProjectId === project.id) {
        setEditingProjectId(null);
        setEditingProjectTitle('');
      }
      if (questionProjectChoice === project.id) {
        setQuestionProjectChoice('__new__');
      }
      if (selectedProjectId === project.id) {
        setSelectedProjectId(ALL_PROJECTS_VALUE);
      }
    } finally {
      setDeletingProjectId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Add Project Question</h2>
        <form onSubmit={submitProjectQuestion} className="space-y-3">
          <Select value={questionProjectChoice} onChange={(event) => setQuestionProjectChoice(event.target.value)}>
            <option value="__new__">Create new project</option>
            {projectsByTitle.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </Select>

          {questionProjectChoice === '__new__' ? (
            <Input
              value={newQuestionProjectTitle}
              onChange={(event) => setNewQuestionProjectTitle(event.target.value)}
              placeholder="Project title"
            />
          ) : null}

          <Textarea
            rows={2}
            value={newQuestionText}
            onChange={(event) => setNewQuestionText(event.target.value)}
            placeholder="Question to investigate"
          />
          <Button
            type="submit"
            className="w-full"
            disabled={
              !newQuestionText.trim() ||
              (questionProjectChoice === '__new__' && !newQuestionProjectTitle.trim()) ||
              submittingQuestionTarget === questionProjectChoice
            }
          >
            {submittingQuestionTarget === questionProjectChoice ? 'Saving question...' : 'Save question'}
          </Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Projects</h2>
        {canUseAdvancedFilters ? (
          <Select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
            <option value={ALL_PROJECTS_VALUE}>All projects</option>
            {projectsByTitle.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </Select>
        ) : (
          <div className="rounded-xl border border-muted/20 bg-surface p-3 text-sm text-muted">
            <p>Free mode shows your full project timeline without quick filters.</p>
            <p className="mt-1">Upgrade to Plus to filter by project and status.</p>
          </div>
        )}

        {!projectsByTitle.length ? (
          <p className="text-sm text-muted">No projects yet. Create one to start tracking questions.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted">All projects are listed by title. Use Open to view project details.</p>

            {canUseAdvancedFilters && (
              <div className="flex flex-wrap gap-2">
                {QUESTION_FILTER_OPTIONS.map((filterOption) => {
                  const count =
                    filterOption.value === 'all' ? allQuestions.length : questionCounts[filterOption.value];
                  const isActive = questionFilter === filterOption.value;
                  return (
                    <Button
                      key={filterOption.value}
                      type="button"
                      variant={isActive ? 'primary' : 'secondary'}
                      className="px-3 py-1 text-xs"
                      onClick={() => setQuestionFilter(filterOption.value)}
                    >
                      {filterOption.label} ({count})
                    </Button>
                  );
                })}
              </div>
            )}

            {!isProjectFilteringActive ? (
              <div className="space-y-3">
                {projectsByTitle.map((project) => (
                  <AllProjectsGroup
                    key={project.id}
                    project={project}
                    questions={visibleQuestionsByProject.get(project.id) ?? []}
                    stats={projectQuestionStats.get(project.id) ?? { all: 0, open: 0, inProgress: 0, answered: 0 }}
                    linksByQuestion={linksByQuestion}
                    questionFilter={canUseAdvancedFilters ? questionFilter : 'all'}
                    onPatch={patchQuestion}
                    onAddLink={addQuestionLink}
                    onRemoveLink={removeQuestionLink}
                    isExpanded={expandedProjectId === project.id}
                    onToggleExpand={() => setExpandedProjectId((current) => (current === project.id ? null : project.id))}
                    isEditingTitle={editingProjectId === project.id}
                    editingTitle={editingProjectId === project.id ? editingProjectTitle : project.title}
                    isSavingTitle={savingProjectTitleId === project.id}
                    onStartEditTitle={() => beginProjectTitleEdit(project)}
                    onCancelEditTitle={cancelProjectTitleEdit}
                    onEditTitleChange={setEditingProjectTitle}
                    onSaveTitle={() => void saveProjectTitle(project.id)}
                    draftQuestion={inlineQuestionDrafts[project.id] ?? ''}
                    onDraftQuestionChange={(value) =>
                      setInlineQuestionDrafts((current) => ({
                        ...current,
                        [project.id]: value
                      }))
                    }
                    onSubmitQuestion={() => void submitInlineQuestion(project.id)}
                    isSubmittingQuestion={submittingQuestionTarget === project.id}
                    isDeletingProject={deletingProjectId === project.id}
                    onDeleteProject={() =>
                      void requestProjectDelete(project, projectQuestionStats.get(project.id)?.all ?? 0)
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {visibleQuestions.map((question) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    links={linksByQuestion.get(question.id) ?? []}
                    onPatch={patchQuestion}
                    onAddLink={addQuestionLink}
                    onRemoveLink={removeQuestionLink}
                  />
                ))}
                {!allQuestions.length && <p className="text-sm text-muted">No questions yet.</p>}
                {allQuestions.length > 0 && !visibleQuestions.length && (
                  <p className="text-sm text-muted">No questions in this status yet.</p>
                )}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function AllProjectsGroup({
  project,
  questions,
  stats,
  linksByQuestion,
  questionFilter,
  isExpanded,
  isEditingTitle,
  editingTitle,
  isSavingTitle,
  onToggleExpand,
  onStartEditTitle,
  onCancelEditTitle,
  onEditTitleChange,
  onSaveTitle,
  draftQuestion,
  onDraftQuestionChange,
  onSubmitQuestion,
  isSubmittingQuestion,
  isDeletingProject,
  onDeleteProject,
  onAddLink,
  onRemoveLink,
  onPatch
}: {
  project: StudyProject;
  questions: StudyQuestion[];
  stats: { all: number; open: number; inProgress: number; answered: number };
  linksByQuestion: Map<string, LinkReference[]>;
  questionFilter: QuestionFilter;
  isExpanded: boolean;
  isEditingTitle: boolean;
  editingTitle: string;
  isSavingTitle: boolean;
  onToggleExpand: () => void;
  onStartEditTitle: () => void;
  onCancelEditTitle: () => void;
  onEditTitleChange: (value: string) => void;
  onSaveTitle: () => void;
  draftQuestion: string;
  onDraftQuestionChange: (value: string) => void;
  onSubmitQuestion: () => void;
  isSubmittingQuestion: boolean;
  isDeletingProject: boolean;
  onDeleteProject: () => void;
  onAddLink: (questionId: string, rawUrl: string) => Promise<LinkActionResult>;
  onRemoveLink: (linkId: string) => Promise<void>;
  onPatch: (
    questionId: string,
    patch: { question?: string; status?: QuestionStatus; notes?: string; conclusion?: string; shareable_insight?: string }
  ) => Promise<void>;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-muted/20 bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {isEditingTitle ? (
            <div className="space-y-2">
              <Input value={editingTitle} onChange={(event) => onEditTitleChange(event.target.value)} placeholder="Project title" />
              <div className="flex gap-2">
                <Button type="button" className="px-3 py-1 text-xs" onClick={onSaveTitle} disabled={isSavingTitle || !editingTitle.trim()}>
                  {isSavingTitle ? 'Saving...' : 'Save title'}
                </Button>
                <Button type="button" variant="secondary" className="px-3 py-1 text-xs" onClick={onCancelEditTitle} disabled={isSavingTitle}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="font-semibold">{project.title}</p>
              {project.description && <p className="mt-1 text-sm text-muted">{project.description}</p>}
              <p className="mt-1 text-xs text-muted">
                {stats.all} total · Open {stats.open} · In progress {stats.inProgress} · Answered {stats.answered}
              </p>
            </>
          )}
        </div>
        {!isEditingTitle && (
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1 text-xs"
              onClick={onStartEditTitle}
              disabled={isDeletingProject}
            >
              Edit title
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1 text-xs"
              onClick={onToggleExpand}
              disabled={isDeletingProject}
            >
              {isExpanded ? 'Close' : 'Open'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1 text-xs text-warning ring-warning/30 hover:bg-warning/10"
              onClick={onDeleteProject}
              disabled={isDeletingProject}
            >
              {isDeletingProject ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        )}
      </div>

      {isExpanded ? (
        <div className="space-y-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitQuestion();
            }}
            className="space-y-2 rounded-xl border border-muted/20 bg-card/40 p-2"
          >
            <Textarea
              rows={2}
              value={draftQuestion}
              onChange={(event) => onDraftQuestionChange(event.target.value)}
              placeholder={`Add a question to ${project.title}`}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmittingQuestion || isDeletingProject || !draftQuestion.trim()}
            >
              {isSubmittingQuestion ? 'Saving question...' : questions.length ? 'Add another question' : 'Add first question'}
            </Button>
          </form>

          {questions.length > 0 ? (
            <div className="space-y-3">
              {questions.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  links={linksByQuestion.get(question.id) ?? []}
                  onPatch={onPatch}
                  onAddLink={onAddLink}
                  onRemoveLink={onRemoveLink}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              {questionFilter === 'all' ? 'No questions yet.' : 'No questions in this status yet.'}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function QuestionCard({
  question,
  links,
  onAddLink,
  onRemoveLink,
  onPatch
}: {
  question: {
    id: string;
    question: string;
    status: QuestionStatus;
    notes?: string;
    conclusion?: string;
    shareable_insight?: string;
  };
  links: LinkReference[];
  onAddLink: (questionId: string, rawUrl: string) => Promise<LinkActionResult>;
  onRemoveLink: (linkId: string) => Promise<void>;
  onPatch: (
    questionId: string,
    patch: { question?: string; status?: QuestionStatus; notes?: string; conclusion?: string; shareable_insight?: string }
  ) => Promise<void>;
}) {
  const [questionText, setQuestionText] = useState(question.question);
  const [notes, setNotes] = useState(question.notes ?? '');
  const [conclusion, setConclusion] = useState(question.conclusion ?? '');
  const [insight, setInsight] = useState(question.shareable_insight ?? '');
  const [status, setStatus] = useState<QuestionStatus>(question.status);
  const [researchLink, setResearchLink] = useState('');
  const [linkFeedback, setLinkFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [removingLinkId, setRemovingLinkId] = useState<string | null>(null);

  async function submitResearchLink(event: FormEvent) {
    event.preventDefault();
    if (!researchLink.trim()) {
      return;
    }

    setIsAddingLink(true);
    try {
      const result = await onAddLink(question.id, researchLink);

      if (!result.ok) {
        setLinkFeedback({ tone: 'error', text: result.message ?? 'Unable to add this link.' });
        return;
      }

      setResearchLink('');
      setLinkFeedback({ tone: 'success', text: 'Research link attached.' });
    } catch {
      setLinkFeedback({ tone: 'error', text: 'Unable to add this link.' });
    } finally {
      setIsAddingLink(false);
    }
  }

  async function handleRemoveLink(linkId: string) {
    setRemovingLinkId(linkId);
    try {
      await onRemoveLink(linkId);
      setLinkFeedback({ tone: 'success', text: 'Research link removed.' });
    } catch {
      setLinkFeedback({ tone: 'error', text: 'Unable to remove this link.' });
    } finally {
      setRemovingLinkId(null);
    }
  }

  return (
    <Card className="space-y-2 border-muted/25 bg-surface/90">
      <Textarea
        rows={3}
        value={questionText}
        onChange={(event) => setQuestionText(event.target.value)}
        className="text-base font-medium leading-relaxed text-ink"
      />
      <Select
        value={status}
        onChange={(event) => {
          const nextStatus = event.target.value as QuestionStatus;
          setStatus(nextStatus);
          onPatch(question.id, { status: nextStatus });
        }}
      >
        <option value="open">Open</option>
        <option value="in_progress">In progress</option>
        <option value="answered">Answered</option>
      </Select>
      <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" />
      <Textarea
        rows={2}
        value={conclusion}
        onChange={(event) => setConclusion(event.target.value)}
        placeholder="Conclusion"
      />
      <Textarea
        rows={2}
        value={insight}
        onChange={(event) => setInsight(event.target.value)}
        placeholder="Optional shareable insight"
      />
      <div className="space-y-2 rounded-xl border border-muted/20 bg-card/50 p-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Research links</p>
        <form onSubmit={submitResearchLink} className="flex gap-2">
          <Input
            type="url"
            inputMode="url"
            value={researchLink}
            onChange={(event) => setResearchLink(event.target.value)}
            placeholder="Paste source link (https://...)"
          />
          <Button type="submit" variant="secondary" className="shrink-0 px-3" disabled={isAddingLink || !researchLink.trim()}>
            {isAddingLink ? 'Adding...' : 'Attach link'}
          </Button>
        </form>
        {linkFeedback && (
          <p className={linkFeedback.tone === 'error' ? 'text-xs text-warning' : 'text-xs text-muted'}>
            {linkFeedback.text}
          </p>
        )}
        {links.length > 0 ? (
          <div className="space-y-2">
            {links.map((link) => (
              <div key={link.id} className="flex items-start gap-2 rounded-xl border border-muted/20 bg-surface p-2">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block min-w-0 flex-1 text-xs text-muted transition hover:text-ink"
                >
                  <p className="font-semibold text-ink">{getLinkDisplayTitle(link)}</p>
                  <p className="truncate">{link.url}</p>
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  className="shrink-0 px-2 py-1 text-xs text-muted"
                  disabled={removingLinkId === link.id}
                  onClick={() => handleRemoveLink(link.id)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">No research links attached yet.</p>
        )}
      </div>
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => onPatch(question.id, { question: questionText.trim(), notes, conclusion, shareable_insight: insight })}
      >
        Save updates
      </Button>
    </Card>
  );
}
