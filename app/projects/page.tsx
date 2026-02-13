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
  const projectsChronological = useMemo(
    () => [...projects].sort((left, right) => left.created_at.localeCompare(right.created_at)),
    [projects]
  );
  const projectIds = useMemo(() => projectsChronological.map((project) => project.id), [projectsChronological]);
  const projectIdSet = useMemo(() => new Set(projectIds), [projectIds]);

  const [selectedProjectId, setSelectedProjectId] = useState<string>(ALL_PROJECTS_VALUE);
  const [questionTargetProjectId, setQuestionTargetProjectId] = useState<string>('');
  const selectedProject = useMemo(
    () =>
      selectedProjectId === ALL_PROJECTS_VALUE
        ? null
        : projectsChronological.find((project) => project.id === selectedProjectId) ?? null,
    [projectsChronological, selectedProjectId]
  );
  const isAllProjectsSelected = selectedProjectId === ALL_PROJECTS_VALUE;
  const isProjectFilteringActive = canUseAdvancedFilters && !isAllProjectsSelected;

  useEffect(() => {
    if (selectedProjectId === ALL_PROJECTS_VALUE) {
      return;
    }
    const exists = projectsChronological.some((project) => project.id === selectedProjectId);
    if (!exists) {
      setSelectedProjectId(ALL_PROJECTS_VALUE);
    }
  }, [projectsChronological, selectedProjectId]);

  useEffect(() => {
    if (!projectsChronological.length) {
      setQuestionTargetProjectId('');
      return;
    }
    if (!projectsChronological.some((project) => project.id === questionTargetProjectId)) {
      setQuestionTargetProjectId(projectsChronological[0].id);
    }
  }, [projectsChronological, questionTargetProjectId]);

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

  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newQuestion, setNewQuestion] = useState('');
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

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!newProjectTitle.trim()) {
      return;
    }

    const project = await addProject({
      id: createId(),
      user_id: userId,
      household_id: householdId,
      title: newProjectTitle.trim(),
      description: newProjectDescription.trim(),
      archived: false
    });

    setSelectedProjectId(project.id);
    setNewProjectTitle('');
    setNewProjectDescription('');
  }

  async function createQuestion(event: FormEvent) {
    event.preventDefault();
    if (!newQuestion.trim()) {
      return;
    }

    const targetProjectId = canUseAdvancedFilters ? selectedProject?.id ?? '' : questionTargetProjectId;
    if (!targetProjectId) {
      return;
    }

    await addQuestion({
      id: createId(),
      user_id: userId,
      household_id: householdId,
      project_id: targetProjectId,
      question: newQuestion.trim(),
      status: 'open',
      notes: '',
      conclusion: '',
      shareable_insight: '',
      is_conflict_copy: false,
      conflict_of: null
    });

    setNewQuestion('');
  }

  async function patchQuestion(
    questionId: string,
    patch: { status?: QuestionStatus; notes?: string; conclusion?: string; shareable_insight?: string }
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

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Create project</h2>
        <form onSubmit={createProject} className="space-y-3">
          <Input
            value={newProjectTitle}
            onChange={(event) => setNewProjectTitle(event.target.value)}
            placeholder="Project title"
          />
          <Textarea
            rows={2}
            value={newProjectDescription}
            onChange={(event) => setNewProjectDescription(event.target.value)}
            placeholder="What are you investigating?"
          />
          <Button type="submit" className="w-full">
            Add project
          </Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Projects</h2>
        {canUseAdvancedFilters ? (
          <Select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
            <option value={ALL_PROJECTS_VALUE}>All projects</option>
            {projectsChronological.map((project) => (
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

        {!projectsChronological.length ? (
          <p className="text-sm text-muted">No projects yet. Create one to start tracking questions.</p>
        ) : (
          <div className="space-y-3">
            {canUseAdvancedFilters && selectedProject ? (
              <>
                <div className="rounded-xl bg-surface p-3">
                  <p className="font-semibold">{selectedProject.title}</p>
                  {selectedProject.description && <p className="mt-1 text-sm text-muted">{selectedProject.description}</p>}
                </div>

                <form onSubmit={createQuestion} className="space-y-2">
                  <Textarea
                    rows={2}
                    value={newQuestion}
                    onChange={(event) => setNewQuestion(event.target.value)}
                    placeholder={`Add a question for ${selectedProject.title}`}
                  />
                  <Button type="submit" className="w-full">
                    Add question
                  </Button>
                </form>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted">
                  {canUseAdvancedFilters
                    ? 'All projects are listed below in chronological order. Choose a specific project above to add a new question.'
                    : 'All projects are listed below in chronological order.'}
                </p>
                {!canUseAdvancedFilters && (
                  <form onSubmit={createQuestion} className="space-y-2">
                    <Select value={questionTargetProjectId} onChange={(event) => setQuestionTargetProjectId(event.target.value)}>
                      {projectsChronological.map((project) => (
                        <option key={project.id} value={project.id}>
                          Add question to: {project.title}
                        </option>
                      ))}
                    </Select>
                    <Textarea
                      rows={2}
                      value={newQuestion}
                      onChange={(event) => setNewQuestion(event.target.value)}
                      placeholder="Add a question to your selected project"
                    />
                    <Button type="submit" className="w-full" disabled={!questionTargetProjectId}>
                      Add question
                    </Button>
                  </form>
                )}
              </div>
            )}

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
                {projectsChronological.map((project) => (
                  <AllProjectsGroup
                    key={project.id}
                    project={project}
                    questions={visibleQuestionsByProject.get(project.id) ?? []}
                    linksByQuestion={linksByQuestion}
                    questionFilter={canUseAdvancedFilters ? questionFilter : 'all'}
                    onPatch={patchQuestion}
                    onAddLink={addQuestionLink}
                    onRemoveLink={removeQuestionLink}
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
  linksByQuestion,
  questionFilter,
  onAddLink,
  onRemoveLink,
  onPatch
}: {
  project: StudyProject;
  questions: StudyQuestion[];
  linksByQuestion: Map<string, LinkReference[]>;
  questionFilter: QuestionFilter;
  onAddLink: (questionId: string, rawUrl: string) => Promise<LinkActionResult>;
  onRemoveLink: (linkId: string) => Promise<void>;
  onPatch: (
    questionId: string,
    patch: { status?: QuestionStatus; notes?: string; conclusion?: string; shareable_insight?: string }
  ) => Promise<void>;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-muted/20 bg-surface p-3">
      <div>
        <p className="font-semibold">{project.title}</p>
        {project.description && <p className="mt-1 text-sm text-muted">{project.description}</p>}
      </div>

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
    patch: { status?: QuestionStatus; notes?: string; conclusion?: string; shareable_insight?: string }
  ) => Promise<void>;
}) {
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
      <p className="font-semibold text-ink">{question.question}</p>
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
        onClick={() => onPatch(question.id, { notes, conclusion, shareable_insight: insight })}
      >
        Save updates
      </Button>
    </Card>
  );
}
