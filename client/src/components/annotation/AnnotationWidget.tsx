import TextClassifier from "./TextClassifier";
import MultiLabelClassifier from "./MultiLabelClassifier";
import NERAnnotator from "./NERAnnotator";
import PairwiseComparison from "./PairwiseComparison";
import RelationsAnnotator from "./RelationsAnnotator";
import type { ProjectLabelConfig, AnnotationResult } from "./types";

interface Props {
  text: string;
  config: ProjectLabelConfig;
  value: AnnotationResult | null;
  onChange: (result: AnnotationResult) => void;
  aiSuggestion?: AnnotationResult | null;
  readOnly?: boolean;
}

export default function AnnotationWidget({ text, config, value, onChange, aiSuggestion, readOnly }: Props) {
  const { type, labels } = config;

  switch (type) {
    case "classification":
      return (
        <TextClassifier
          text={text}
          labels={labels}
          value={value?.labels?.[0] ?? null}
          onChange={onChange}
          aiSuggestion={aiSuggestion?.labels?.[0]}
          readOnly={readOnly}
        />
      );

    case "multi_classification":
      return (
        <MultiLabelClassifier
          text={text}
          labels={labels}
          value={value?.labels ?? []}
          onChange={onChange}
          aiSuggestion={aiSuggestion?.labels}
          readOnly={readOnly}
        />
      );

    case "ner":
      return (
        <NERAnnotator
          text={text}
          labels={labels}
          value={value?.spans ?? []}
          onChange={onChange}
          readOnly={readOnly}
        />
      );

    case "pairwise":
      return (
        <PairwiseComparison
          text={text}
          labels={labels}
          value={value?.choice ?? null}
          onChange={onChange}
          readOnly={readOnly}
        />
      );

    case "relations": {
      // Split labels into entity labels and relation labels by convention:
      // labels with "rel:" prefix = relation labels, rest = entity labels
      const entityLabels = labels.filter(l => !l.value.startsWith("rel:"));
      const relationLabels = labels.filter(l => l.value.startsWith("rel:")).map(l => ({ ...l, value: l.value.replace("rel:", "") }));
      return (
        <RelationsAnnotator
          text={text}
          entityLabels={entityLabels}
          relationLabels={relationLabels.length ? relationLabels : [{ value: "علاقة", color: "#6366f1" }]}
          value={{ entities: value?.entities ?? [], relations: value?.relations ?? [] }}
          onChange={onChange}
          readOnly={readOnly}
        />
      );
    }

    default:
      return (
        <div className="bg-white border-2 border-slate-100 rounded-2xl p-6">
          <p className="text-slate-800 text-lg leading-loose text-right" dir="rtl">{text}</p>
          <p className="text-xs text-slate-400 mt-4">نوع التوسيم غير معروف: {type}</p>
        </div>
      );
  }
}
