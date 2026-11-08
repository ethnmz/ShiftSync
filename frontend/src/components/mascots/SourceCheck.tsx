import { AiByline } from "./Flat";

// Header for "where it came from": a plain word-for-word match of the fact's
// quote against its source statement (code, not a model). It only says
// whether the words appear; it does not say the fact is true.
export default function SourceCheck({ quote, source }: { quote: string; source: string | undefined }) {
  const clean = (s: string) => s.toLowerCase().replace(/[.,]+$/, "").trim();
  const found = !!source && source.toLowerCase().includes(clean(quote));
  return (
    <div className="mb-4 flex flex-col gap-1.5">
      <AiByline kind="facet" />
      <p className="text-sm text-muted">
        {found ? "The quote appears word for word in what was said:" : "The quote doesn't appear word for word. Compare it with what was said:"}
      </p>
    </div>
  );
}
