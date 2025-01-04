import { ChatWindowMessage } from "@/schema/ChatWindowMessage";
import { useEffect, useRef, useState } from "react";
import { Id, toast } from "react-toastify";

export const useLLMWorker = () => {
  const worker = useRef<Worker | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingModelProgress, setLoadingModelProgress] = useState({
    text: "",
    progress: 0,
    loadingPart: "Laster LLM modell...",
    percentage: 0,
  });
  const [messages, setMessages] = useState<ChatWindowMessage[]>([]);
  const initProgressToastId = useRef<Id | null>(null);

  const handleLogMessage = (e: MessageEvent) => {
    setIsLoading(false);
    // toast(`${e.data.message}`)
  };

  const handleErrorMessage = (e: MessageEvent) => {
    setIsLoading(false);
    toast(`Error: ${e.data.error}`);
  };

  const handleInitProgressMessage = (e: MessageEvent) => {
    setLoadingModelProgress({
      ...e.data.data,
      ...handleModelProgessText(e.data.data.text),
    });
  };

  const handleModelProgessText = (message: String) => {
    console.log("handleModelProgessText: message", message);
    if (
      [
        "Fetching param cache",
        "Loading model from cache",
        "Loading GPU",
        "Finish loading",
      ].some((item) => message.includes(item))
    ) {
      // Extract the part before the colon
      const loadingPart = message.split(":")[0];

      // Extract the numbers inside the square brackets
      const match = loadingPart.match(/\[(\d+)\/(\d+)\]/);

      if (match) {
        const loaded = parseInt(match[1], 10) || 0; // Loaded number
        const total = parseInt(match[2], 10) || 0; // Total number
        // Calculate the percentage
        const percentage = (loaded / total) * 100;

        return {
          percentage: percentage.toFixed(2),
          loadingPart: loadingPart.replace(
            "Loading model from cache",
            "Laster modell fra hurtigbufferet "
          ),
        };
      } else {
        return {
          percentage: 100,
          loadingPart: message,
        };
      }
    }

    return {
      percentage: 0,
      loadingPart: "Laster LLM modell...",
    };
  };

  const handleCompleteMessage = (e: MessageEvent) => {
    console.log("Received complete message:", e.data);
    if (e.data.message) {
      setIsLoading(false);
      setMessages((prev) => [...prev, e.data.message]);
    } else {
      console.error("Received complete message without content:", e.data);
      toast("Received empty response from AI", { theme: "dark" });
    }
  };

  const unknonwEventType = (e: MessageEvent) => {
    console.error("Received unknown event type:", e.data);
    // toast("Received unknown event type");
  };

  const eventMap: any = {
    log: handleLogMessage,
    error: handleErrorMessage,
    init_progress: handleInitProgressMessage,
    complete: handleCompleteMessage,
    unknown: unknonwEventType,
  };

  const handleWorkerMessage = async (e: MessageEvent) => {
    const eventType = e.data.type;
    const eventHandler = eventMap[eventType] || eventMap["unknown"];
    await eventHandler(e);
  };

  const postMessage = ({
    type,
    messages,
    pdf,
  }: {
    type: string;
    messages?: any;
    pdf?: Blob;
  }) => {
    worker.current?.postMessage({ type, messages, pdf });
  };

  useEffect(() => {
    if (!worker.current) {
      worker.current = new Worker(new URL("../worker.ts", import.meta.url), {
        type: "module",
      });

      worker.current.addEventListener("message", handleWorkerMessage);
    }

    return () => {
      worker.current?.removeEventListener("message", handleWorkerMessage);
    };
  }, []);

  return {
    worker,
    messages,
    isLoading,
    postMessage,
    setMessages,
    setIsLoading,
    loadingModelProgress,
  };
};
