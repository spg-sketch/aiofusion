import { useGetPublishedHowto, getGetPublishedHowtoQueryKey } from "@workspace/api-client-react";
import { BodyView } from "./howto/HowtoBlocks";
import { errorStatus } from "../lib/howto";
import type { HowtoEntry } from "../lib/howto";

export function GeorgeGuide({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, isLoading, isError, error, refetch } = useGetPublishedHowto(id, {
    query: { queryKey: getGetPublishedHowtoQueryKey(id), refetchOnMount: "always", retry: false },
  });
  const entry = data as HowtoEntry | undefined;
  return (
    <section aria-label="Full guidance" className="rounded-xl bg-white border p-4 text-[13px]">
      <button className="underline mb-4" onClick={onBack}>Back to George's results</button>
      {isLoading ? <p role="status">Loading guide...</p> :
        isError || !entry ? (
          <div role="alert">
            <p>{errorStatus(error) === 404 ? "This guide is no longer published or has been removed." : "This guide could not be loaded."}</p>
            {errorStatus(error) !== 404 && <button className="underline mt-2" onClick={() => void refetch()}>Try again</button>}
          </div>
        ) : (
          <article>
            <h2 className="font-semibold text-lg mb-2">{entry.title}</h2>
            <p className="mb-4 text-gray-600">{entry.description}</p>
            <BodyView body={entry.body} />
          </article>
        )}
    </section>
  );
}