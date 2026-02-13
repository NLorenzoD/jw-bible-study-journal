'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { FormEvent, useMemo, useState } from 'react';

import { Button } from '@/components/shared/button';
import { Card } from '@/components/shared/card';
import { Input, Select, Textarea } from '@/components/shared/inputs';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { db } from '@/lib/store/db';
import { addProject, addQuestion, createId, updateQuestion } from '@/lib/store/repository';
import { QuestionStatus } from '@/lib/types';

export default function ProjectsPage() {
  const { userId, householdId } = useUserContext();

  const projects = useLiveQuery(
    () => db.projects.where('user_id').equals(userId).and((project) => !project.archived).reverse().sortBy('updated_at'),
    [userId],
    []
  );

  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId]
  );

  const questions = useLiveQuery(
    () =>
      selectedProject
        ? db.questions
            .where('project_id')
            .equals(selectedProject.id)
            .and((question) => question.user_id === userId)
            .reverse()
            .sortBy('updated_at')
        : Promise.resolve([]),
    [selectedProject?.id, userId],
    []
  );

  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newQuestion, setNewQuestion] = useState('');

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
    if (!selectedProject || !newQuestion.trim()) {
      return;
    }

    await addQuestion({
      id: createId(),
      user_id: userId,
      household_id: householdId,
      project_id: selectedProject.id,
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
        <Select value={selectedProject?.id ?? ''} onChange={(event) => setSelectedProjectId(event.target.value)}>
          <option value="">Choose a project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </Select>

        {selectedProject ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-surface p-3">
              <p className="font-semibold">{selectedProject.title}</p>
              {selectedProject.description && <p className="mt-1 text-sm text-muted">{selectedProject.description}</p>}
            </div>

            <form onSubmit={createQuestion} className="space-y-2">
              <Textarea
                rows={2}
                value={newQuestion}
                onChange={(event) => setNewQuestion(event.target.value)}
                placeholder="Add a question for this project"
              />
              <Button type="submit" className="w-full">
                Add question
              </Button>
            </form>

            <div className="space-y-3">
              {questions.map((question) => (
                <QuestionCard key={question.id} question={question} onPatch={patchQuestion} />
              ))}
              {!questions.length && <p className="text-sm text-muted">No questions yet.</p>}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Select a project to manage questions and conclusions.</p>
        )}
      </Card>
    </div>
  );
}

function QuestionCard({
  question,
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
  onPatch: (
    questionId: string,
    patch: { status?: QuestionStatus; notes?: string; conclusion?: string; shareable_insight?: string }
  ) => Promise<void>;
}) {
  const [notes, setNotes] = useState(question.notes ?? '');
  const [conclusion, setConclusion] = useState(question.conclusion ?? '');
  const [insight, setInsight] = useState(question.shareable_insight ?? '');
  const [status, setStatus] = useState<QuestionStatus>(question.status);

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
