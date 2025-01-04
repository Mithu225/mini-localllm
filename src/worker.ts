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
const SYSTEM_TEMPLATE = `You are an experienced researcher and helpful AI assistant, expert at interpreting and answering questions based on provided sources. 

When you have relevant context:
1. Use the provided context to give accurate, helpful answers
2. If the context doesn't fully answer the question, say so and explain what additional information would be needed
3. If you're unsure about something, be honest about your uncertainty

When you don't have relevant context:
1. Provide helpful general responses based on your knowledge
2. Be conversational and engaging while remaining professional
3. If you can't answer something, be honest about it

Always aim to be:
- Clear and concise
- Accurate and helpful
- Professional yet friendly
- Honest about limitations`;

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
        "Document has been processed successfully! You can now ask questions about its contents.",
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
      "You are an AI assistant that helps summarize context documents. Create a brief, coherent summary of the provided documents that captures their key points and relevance to the user's question.",
    ],
    [
      "user",
      `Please summarize the following documents in relation to this question: "{userMessage}"\n\nDocuments:\n {contextDocs}`,
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
      "You are an AI assistant that helps rephrase questions to be more search-friendly. Keep the rephrased question concise and focused.",
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
        "You are a helpful AI assistant. Please provide clear, informative, and engaging responses to help users with their questions. If you don't know something, be honest about it.",
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
        "When responding to me, use the following documents as context:\n<context>\n{context}\n</context>",
      ],
      [
        "assistant",
        "I'll help answer your questions using the provided documents as context. If I can not find the answer in the documents, I will try loook carefully at the question and check the context. If I can't find the answer in the context, I'll provide a helpful general response.",
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
