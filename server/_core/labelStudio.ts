import axios, { type AxiosInstance } from "axios";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LSProject {
  id: number;
  title: string;
  description?: string;
  label_config?: string;
  created_at?: string;
  updated_at?: string;
  task_number?: number;
  num_tasks_with_annotations?: number;
  total_annotations_number?: number;
}

export interface LSTask {
  id: number;
  project: number;
  data: Record<string, unknown>;
  annotations?: LSAnnotation[];
  predictions?: unknown[];
  created_at?: string;
  updated_at?: string;
  is_labeled?: boolean;
  total_annotations?: number;
}

export interface LSAnnotation {
  id: number;
  task: number;
  project?: number;
  result: unknown[];
  completed_by?: number | { id: number; email?: string };
  created_at?: string;
  updated_at?: string;
  was_cancelled?: boolean;
  ground_truth?: boolean;
  lead_time?: number;
}

export interface LSUser {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  avatar?: string;
  initials?: string;
}

export interface LSProjectStats {
  total_tasks: number;
  total_annotations: number;
  num_tasks_with_annotations: number;
  total_predictions: number;
  useful_annotation_number: number;
  ground_truth_number: number;
  skipped_annotations_number: number;
}

export interface CreateProjectInput {
  title: string;
  description?: string;
  label_config?: string;
  expert_instruction?: string;
  show_instruction?: boolean;
  show_skip_button?: boolean;
  enable_empty_annotation?: boolean;
  show_annotation_history?: boolean;
  maximum_annotations?: number;
}

export interface CreateTaskInput {
  project: number;
  data: Record<string, unknown>;
}

export interface CreateAnnotationInput {
  result: unknown[];
  was_cancelled?: boolean;
  ground_truth?: boolean;
  lead_time?: number;
}

// ── Client ────────────────────────────────────────────────────────────────────

export class LabelStudioClient {
  private readonly http: AxiosInstance;

  constructor(baseUrl: string, apiKey: string) {
    const normalizedUrl = baseUrl.replace(/\/$/, "");
    this.http = axios.create({
      baseURL: `${normalizedUrl}/api`,
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30_000,
    });
  }

  // ── Projects ────────────────────────────────────────────────────────────────

  async createProject(input: CreateProjectInput): Promise<LSProject> {
    const { data } = await this.http.post<LSProject>("/projects/", input);
    return data;
  }

  async getProject(projectId: number): Promise<LSProject> {
    const { data } = await this.http.get<LSProject>(`/projects/${projectId}/`);
    return data;
  }

  async listProjects(): Promise<LSProject[]> {
    const { data } = await this.http.get<{ results: LSProject[] }>("/projects/");
    return data.results ?? [];
  }

  // ── Tasks ───────────────────────────────────────────────────────────────────

  async createTask(input: CreateTaskInput): Promise<LSTask> {
    const { data } = await this.http.post<LSTask>("/tasks/", input);
    return data;
  }

  async bulkCreateTasks(
    projectId: number,
    tasks: Array<Record<string, unknown>>
  ): Promise<LSTask[]> {
    // Label Studio bulk import endpoint
    const payload = tasks.map((d) => ({ data: d }));
    const { data } = await this.http.post<LSTask[]>(
      `/projects/${projectId}/import`,
      payload
    );
    return Array.isArray(data) ? data : [];
  }

  async getTask(taskId: number): Promise<LSTask> {
    const { data } = await this.http.get<LSTask>(`/tasks/${taskId}/`);
    return data;
  }

  async getProjectTasks(
    projectId: number,
    page = 1,
    pageSize = 100
  ): Promise<{ tasks: LSTask[]; total: number }> {
    const { data } = await this.http.get<{
      tasks: LSTask[];
      total: number;
    }>(`/projects/${projectId}/tasks/`, {
      params: { page, page_size: pageSize },
    });
    return { tasks: data.tasks ?? [], total: data.total ?? 0 };
  }

  // ── Annotations ─────────────────────────────────────────────────────────────

  async getTaskCompletions(taskId: number): Promise<LSAnnotation[]> {
    const { data } = await this.http.get<LSAnnotation[]>(
      `/tasks/${taskId}/annotations/`
    );
    return Array.isArray(data) ? data : [];
  }

  async createAnnotation(
    taskId: number,
    input: CreateAnnotationInput
  ): Promise<LSAnnotation> {
    const { data } = await this.http.post<LSAnnotation>(
      `/tasks/${taskId}/annotations/`,
      input
    );
    return data;
  }

  async updateAnnotation(
    annotationId: number,
    input: Partial<CreateAnnotationInput>
  ): Promise<LSAnnotation> {
    const { data } = await this.http.patch<LSAnnotation>(
      `/annotations/${annotationId}/`,
      input
    );
    return data;
  }

  async deleteAnnotation(annotationId: number): Promise<void> {
    await this.http.delete(`/annotations/${annotationId}/`);
  }

  // ── Stats & Export ──────────────────────────────────────────────────────────

  async getProjectStats(projectId: number): Promise<LSProjectStats> {
    const project = await this.getProject(projectId);
    return {
      total_tasks: project.task_number ?? 0,
      total_annotations: project.total_annotations_number ?? 0,
      num_tasks_with_annotations: project.num_tasks_with_annotations ?? 0,
      total_predictions: 0,
      useful_annotation_number: project.total_annotations_number ?? 0,
      ground_truth_number: 0,
      skipped_annotations_number: 0,
    };
  }

  async exportAnnotations(
    projectId: number,
    format: "JSON" | "CSV" | "TSV" | "CONLL2003" = "JSON"
  ): Promise<unknown> {
    const { data } = await this.http.get(
      `/projects/${projectId}/export`,
      { params: { exportType: format } }
    );
    return data;
  }

  // ── Users ───────────────────────────────────────────────────────────────────

  async getUser(userId: number): Promise<LSUser> {
    const { data } = await this.http.get<LSUser>(`/users/${userId}/`);
    return data;
  }

  async getUsers(): Promise<LSUser[]> {
    const { data } = await this.http.get<LSUser[]>("/users/");
    return Array.isArray(data) ? data : [];
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _client: LabelStudioClient | null = null;

export function getLabelStudioClient(): LabelStudioClient {
  if (!_client) {
    const url = process.env.LABEL_STUDIO_URL;
    const key = process.env.LABEL_STUDIO_API_KEY;

    if (!url || !key) {
      throw new Error(
        "LABEL_STUDIO_URL and LABEL_STUDIO_API_KEY environment variables are required"
      );
    }

    _client = new LabelStudioClient(url, key);
  }
  return _client;
}
