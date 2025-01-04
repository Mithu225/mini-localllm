import { ChatWindowMessage } from "@/schema/ChatWindowMessage";
import { Voy as VoyClient } from "voy-search";
import {
  Annotation,
  MessagesAnnotation,
  StateGraph,
} from "@langchain/langgraph/web";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/hf_transformers";
import { VoyVectorStore } from "@langchain/community/vectorstores/voy";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import {
  AIMessageChunk,
  MessageContent,
  type BaseMessage,
} from "@langchain/core/messages";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { ChatWebLLM } from "@langchain/community/chat_models/webllm";
import { Document } from "@langchain/core/documents";
import { RunnableConfig } from "@langchain/core/runnables";
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { WebPDFLoader } from "@langchain/community/document_loaders/web/pdf";

// Initialize embeddings and vector store
const embeddings = new HuggingFaceTransformersEmbeddings({
  model: "nomic-ai/nomic-embed-text-v1.5",
});

const voyClient = new VoyClient();
const vectorstore = new VoyVectorStore(voyClient, embeddings);

const model = new ChatWebLLM({
  model: "Llama-3.2-3B-Instruct-q4f32_1-MLC",
});

await model.initialize((event) =>
  self.postMessage({ type: "init_progress", data: event })
);

// Constants
const SYSTEM_TEMPLATE = `Du er norsk og en erfaren forsker og hjelpsom AI-assistent, ekspert på å tolke og svare på spørsmål basert på de tilgjengelige kildene.

Når du har relevant kontekst:

Bruk den tilgjengelige konteksten for å gi nøyaktige og hjelpsomme svar
Hvis konteksten ikke fullt ut svarer på spørsmålet, si fra og forklar hvilken ytterligere informasjon som trengs
Hvis du er usikker på noe, vær ærlig om usikkerheten
Når du ikke har relevant kontekst:

Gi hjelpsomme generelle svar basert på din kunnskap
Vær samtalende og engasjerende, samtidig som du opprettholder profesjonalitet
Hvis du ikke kan svare på noe, vær ærlig om det
Streb alltid etter å være:

Klar og kortfattet
Nøyaktig og hjelpsom
Profesjonell, men vennlig
Ærlig om begrensninger`;

// Types
interface RAGState {
  messages: BaseMessage[];
  rephrasedQuestion: string | null;
  sourceDocuments: Document[];
  contextSummary: string | null;
}

// PDF Processing
async function embedPDF(event: any) {
  const pdfBlob = event.data.pdf as Blob;
  const pdfLoader = new WebPDFLoader(pdfBlob, { parsedItemSeparator: " " });
  const docs = await pdfLoader.load();

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });

  const splitDocs = await splitter.splitDocuments(docs);

  self.postMessage({ type: "log", data: splitDocs });

  await vectorstore.addDocuments(splitDocs);

  // Send completion message to inform user
  self.postMessage({
    type: "complete",
    message: {
      role: "assistant",
      content:
        "Dokumentet har blitt behandlet vellykket! Du kan nå stille spørsmål om innholdet.",
    },
  });

  return {};
}

// Document Retrieval
async function retrieveSourceDocumentsNode(
  state: RAGState,
  config: RunnableConfig
): Promise<{ sourceDocuments: Document[] }> {
  console.log(state, "retrieveSourceDocumentsNode: state");
  try {
    const retrieverQuery =
      state.rephrasedQuestion ?? (state.messages.at(-1)?.content as string);
    const retriever = vectorstore.asRetriever({
      k: 10,
      searchKwargs: { lambda: 0.75 },
    });
    const docs = await retriever.invoke(retrieverQuery, config);
    console.log("retrieveSourceDocumentsNode: docs", docs);
    return { sourceDocuments: docs };
  } catch (error) {
    console.log("No documents in vector store, proceeding with empty context");
    return { sourceDocuments: [] };
  }
}

// Context Summarization
async function summarizeContextNode(
  state: RAGState,
  model: ChatWebLLM,
  config: RunnableConfig
): Promise<{ contextSummary: AIMessageChunk | string }> {
  console.log("summarizeContextNode: state", state);
  if (!state.sourceDocuments?.length) {
    return { contextSummary: "" };
  }

  const summarizePrompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "Du er en AI-assistent som hjelper til med å oppsummere kontekstdokumenter. Lag en kortfattet, sammenhengende oppsummering av de relevante dokumentene som fanger deres hovedpunkter og betydning for brukerens spørsmål.",
    ],
    [
      "user",
      `Vennligst oppsummer de følgende dokumentene i forhold til dette spørsmålet.: "{userMessage}"\n\nDocuments:\n {contextDocs}`,
    ],
  ]);

  const userMessage =
    state.rephrasedQuestion ?? (state.messages.at(-1)?.content as string);

  const contextDocs = state.sourceDocuments
    .map((doc, i) => `<doc>${doc.pageContent}</doc>`)
    .join("\n\n");

  const formattedPrompt = await summarizePrompt.invoke(
    {
      userMessage: userMessage,
      contextDocs: contextDocs,
    },
    config
  );

  const response = await model.invoke(formattedPrompt, config);

  return { contextSummary: response };
}

// Question Processing
async function rephraseQuestionNode(
  state: RAGState,
  model: ChatWebLLM,
  config: RunnableConfig
): Promise<{ rephrasedQuestion: MessageContent }> {
  console.log(state, "rephraseQuestionNode: state");
  const originalQuery = state.messages.at(-1)?.content as string;

  const rephrasePrompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "Du er en AI-assistent som hjelper med å omformulere spørsmål for å gjøre dem mer søkervennlige. Hold det omformulerte spørsmålet kort og fokusert.",
    ],
    ["placeholder", "{messages}"],
    ["user", originalQuery],
  ]);

  const formattedPrompt = await rephrasePrompt.invoke(
    {
      messages: state.messages,
      input: originalQuery,
    },
    config
  );
  const response = await model.invoke(formattedPrompt, config);

  console.log(response, "rephraseQuestionNode: response");
  return { rephrasedQuestion: response.content };
}

// Response Generation
async function generateResponseNode(
  state: RAGState,
  model: ChatWebLLM,
  config: RunnableConfig
): Promise<{ messages: any[] }> {
  console.log("generateResponseNode: state", state);
  const userMessage =
    state.rephrasedQuestion ?? (state.messages.at(-1)?.content as string);

  let responseChainPrompt;
  let formattedPrompt;

  if (!state.contextSummary) {
    // If no contextSummary, use a general conversation prompt
    responseChainPrompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        "Du er en hjelpsom AI-assistent. Vennligst gi klare, informative og engasjerende svar for å hjelpe brukere med spørsmålene deres. Hvis du ikke vet noe, vær ærlig om det.",
      ],
      // ["placeholder", "{messages}"],
      ["user", userMessage],
    ]);

    formattedPrompt = await responseChainPrompt.invoke(
      {
        messages: state.messages,
      },
      config
    );
  } else {
    responseChainPrompt = ChatPromptTemplate.fromMessages([
      ["system", SYSTEM_TEMPLATE],
      [
        "user",
        "Når du svarer meg, bruk følgende dokumenter som kontekst.:\n<context>\n{context}\n</context>",
      ],
      [
        "assistant",
        "Jeg vil hjelpe deg med å svare på spørsmålene dine ved å bruke de tilgjengelige dokumentene som kontekst. Hvis jeg ikke finner svaret i dokumentene, vil jeg nøye vurdere spørsmålet og sjekke konteksten. Hvis jeg fortsatt ikke finner svaret i konteksten, vil jeg gi et hjelpsomt generelt svar.",
      ],
      ["user", userMessage],
      // ["placeholder", "{messages}"],
    ]);

    formattedPrompt = await responseChainPrompt.invoke(
      {
        messages: state.messages,
        context: state.contextSummary,
      },
      config
    );
  }

  const response = await model.invoke(formattedPrompt, config);

  console.log(response, "generateResponseNode: response");

  if (typeof response === "string") {
    return { messages: [{ role: "assistant", content: response }] };
  } else {
    return { messages: [response] };
  }
}

// Main RAG Pipeline
async function generateRAGResponse(
  messages: ChatWindowMessage[],
  model: ChatWebLLM,
  devModeTracer?: LangChainTracer
) {
  console.log("Starting generateRAGResponse with messages:", messages);

  const RAGStateAnnotation = Annotation.Root({
    ...MessagesAnnotation.spec,
    rephrasedQuestion: Annotation<string>,
    sourceDocuments: Annotation<Document[]>,
    contextSummary: Annotation<string>,
  });

  const workflow = new StateGraph(RAGStateAnnotation);

  workflow
    .addNode("rephraseQuestionNode", async (state, config) =>
      rephraseQuestionNode(state, model, config)
    )
    .addNode("summarizeContextNode", async (state, config) =>
      summarizeContextNode(state, model, config)
    )
    .addNode("retrieveSourceDocumentsNode", retrieveSourceDocumentsNode)
    .addNode("generateResponseNode", async (state, config) =>
      generateResponseNode(state, model, config)
    )
    .addConditionalEdges("__start__", async (state) => {
      console.log("generateRAGResponse: state", state);
      if (state.messages.length === 1) {
        return "generateResponseNode";
      }
      if (state.messages.length > 1) {
        return "rephraseQuestionNode";
      }
      return "generateResponseNode";
    })
    .addEdge("rephraseQuestionNode", "retrieveSourceDocumentsNode")
    .addEdge("retrieveSourceDocumentsNode", "summarizeContextNode")
    .addEdge("summarizeContextNode", "generateResponseNode")
    .compile();

  const chain = workflow.compile();

  const config: RunnableConfig = {};
  if (devModeTracer) {
    config.callbacks = [devModeTracer];
  }

  try {
    const result = await chain.invoke(
      {
        messages,
        rephrasedQuestion: undefined,
        sourceDocuments: [],
      },
      config
    );

    console.log("RAG result:", result);

    if (!result || !result.messages || result.messages.length === 0) {
      throw new Error("No response generated from the model");
    }

    const lastMessage = result.messages[result.messages.length - 1];
    console.log("Last message:", lastMessage);

    return lastMessage.content;
  } catch (error) {
    console.error("Error in generateRAGResponse:", error);
    throw error;
  }
}

const queryEvent = async (event: any) => {
  console.log(vectorstore.docstore.length);
  if (!vectorstore.docstore.length) {
    const result = await model.invoke([
      {
        role: "system",
        content:
          "Du er Norsk og en erfaren forsker og hjelpsom AI-assistent fra ThuHuynh.no",
      },
      {
        role: "user",
        content: "Hei!",
      },
    ]);
    console.log(result);

    self.postMessage({
      type: "complete",
      message: { role: "assistant", content: result.content },
    });

    return;
  }
  try {
    console.log("Starting queryEvent with data:", event.data);
    const response = await generateRAGResponse(
      event.data.messages,
      model,
      event.data.devMode
        ? new LangChainTracer({ projectName: "dev" })
        : undefined
    );

    console.log("Generated response:", response);

    if (!response) {
      throw new Error("No response generated");
    }

    self.postMessage({
      type: "complete",
      message: { role: "assistant", content: response },
    });

    return response;
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error in queryEvent:", error);
      self.postMessage({
        type: "error",
        error:
          error?.message || "An error occurred while processing your request",
      });
    }
  }
};

const events: any = {
  embed: embedPDF,
  query: queryEvent,
};

// Message Handler
self.addEventListener("message", async (event: { data: any }) => {
  try {
    const eventFunc = events?.[event.data.type] || "init";

    self.postMessage({
      type: "log",
      data: `Received data! ${eventFunc}`,
    });

    await eventFunc(event);
  } catch (error) {
    console.error("Error in worker:", error);
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
