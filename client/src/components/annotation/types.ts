export type AnnotationType = "classification" | "multi_classification" | "ner" | "pairwise" | "relations" | "html_interface";

export interface LabelOption {
  value: string;
  color: string;
  shortcut?: string;
}

export interface ProjectLabelConfig {
  type: AnnotationType;
  labels: LabelOption[];
  instructions?: string;
  minAnnotations?: number;
  aiPreAnnotation?: boolean;
}

export interface NERSpan {
  start: number;
  end: number;
  text: string;
  label: string;
  color: string;
}

export interface RelationEntity {
  id: string;
  start: number;
  end: number;
  text: string;
  label: string;
  color: string;
}

export interface Relation {
  from: string;
  to: string;
  label: string;
}

export interface AnnotationResult {
  type: AnnotationType;
  // classification / multi_classification
  labels?: string[];
  // NER
  spans?: NERSpan[];
  // pairwise
  choice?: string;
  // relations
  entities?: RelationEntity[];
  relations?: Relation[];
  // meta
  confidence?: number;
  timeSpentSeconds?: number;
}
