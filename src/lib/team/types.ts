export type Role = "admin" | "developer" | "viewer";
export type Status = "todo" | "in_progress" | "in_review" | "done";
export type Priority = "low" | "medium" | "high";
export type TaskType = "task" | "bug" | "story" | "epic" | "subtask";
export type SprintState = "planned" | "active" | "completed";

export interface Organization {
  id: number;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: number;
  organization_id: number;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  created_at: string;
  updated_at: string;
}

export type PublicUser = Omit<User, "password_hash">;

export interface Project {
  id: number;
  organization_id: number;
  key: string;
  name: string;
  description: string | null;
  created_by: number | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Sprint {
  id: number;
  project_id: number;
  name: string;
  goal: string | null;
  state: SprintState;
  start_date: string | null;
  end_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  project_id: number;
  number: number;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  type: TaskType;
  assignee_id: number | null;
  creator_id: number;
  reporter_id: number | null;
  due_date: string | null;
  start_date: string | null;
  position: number;
  sprint_id: number | null;
  parent_id: number | null;
  story_points: number | null;
  labels: string[];
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: number;
  task_id: number;
  author_id: number;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: number;
  task_id: number;
  user_id: number | null;
  action:
    | "created"
    | "status_changed"
    | "assigned"
    | "unassigned"
    | "priority_changed"
    | "due_date_changed"
    | "start_date_changed"
    | "title_changed"
    | "description_changed"
    | "commented"
    | "sprint_changed"
    | "story_points_changed"
    | "labels_changed"
    | "type_changed"
    | "reporter_changed"
    | "parent_changed"
    | "attachment_added"
    | "attachment_removed";
  meta: Record<string, unknown>;
  created_at: string;
}

export interface Attachment {
  id: number;
  task_id: number;
  uploader_id: number | null;
  storage_path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface TimeEntry {
  id: number;
  user_id: number;
  task_id: number | null;
  project_id: number | null;
  entry_date: string;
  minutes: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Mention {
  id: number;
  comment_id: number;
  user_id: number;
  task_id: number;
  read_at: string | null;
  created_at: string;
}
