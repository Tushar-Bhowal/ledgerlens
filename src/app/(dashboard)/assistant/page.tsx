import { Assistant } from "@/features/assistant/assistant";

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ example?: string | string[] }> }) {
  const { example } = await searchParams;
  const exampleId = typeof example === "string" ? example : undefined;

  return <Assistant key={exampleId} exampleId={exampleId} />;
}
