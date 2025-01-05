import { useState, useRef, useCallback, FormEvent, useEffect } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  ArrowRight,
  ArrowRightIcon,
  ArrowUp,
  ChevronRight,
  Paperclip,
  Send,
  Upload,
} from "lucide-react";
import { ChatWindowMessage } from "@/schema/ChatWindowMessage";
import { useLLMWorker } from "@/hooks/useLLMWorker";
import InteractiveHoverButton from "@/components/ui/interactive-hover-button";
import NumberTicker from "@/components/ui/number-ticker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import RetroGrid from "@/components/ui/retro-grid";
import classnames from "classnames";
import AnimatedShinyText from "@/components/ui/animated-shiny-text";
import SparklesText from "@/components/ui/sparkles-text";
import AnimatedGradientText from "@/components/ui/animated-gradient-text";
import TypingAnimation from "@/components/ui/typing-animation";

function App() {
  const [selectedPDF, setSelectedPDF] = useState<File | null>(null);
  const [input, setInput] = useState("");
  const [startHelllo, setStartHello] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {
    messages: workerMessages,
    isLoading: workerIsLoading,
    postMessage,
    setMessages,
    setIsLoading: setWorkerIsLoading,
    loadingModelProgress,
  } = useLLMWorker();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [workerMessages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedPDF(e.target.files[0]);
    }
  };

  const handleUpload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPDF) {
      toast("Please select a file first", { theme: "dark" });
      return;
    }

    setWorkerIsLoading(true);
    const aiMessage: ChatWindowMessage = {
      role: "assistant",
      content: `Processing document: ${selectedPDF.name}...`,
    };
    setMessages((prev) => [...prev, aiMessage]);

    const blob = new Blob([selectedPDF], { type: selectedPDF.type });
    postMessage({
      pdf: blob,
      type: "embed",
    });
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (selectedPDF) {
      handleUpload(e);
    }

    if (!input.trim()) return;

    const newHumanMessage: ChatWindowMessage = { role: "user", content: input };
    const newMessages = [...workerMessages, newHumanMessage];
    setMessages(newMessages);
    postMessage({
      type: "query",
      messages: newMessages,
    });

    setInput("");
    setWorkerIsLoading(true);
  };

  const isModelLoading =
    loadingModelProgress.loadingPart && loadingModelProgress.progress !== 1;

  useEffect(() => {
    if (!isModelLoading && !startHelllo) {
      postMessage({
        type: "query",
        messages: [
          {
            role: "system",
            content:
              "Du er Norsk og en erfaren forsker og hjelpsom AI-assistent fra ThuHuynh.no",
          },
          {
            role: "user",
            content: "Hei!",
          },
        ],
      });

      setStartHello(true);
    }
  }, [isModelLoading, startHelllo]);

  return (
    <div className="flex flex-col h-screen">
      {isModelLoading && (
        <div
          className={classnames(
            "flex justify-center items-center w-full h-full"
          )}
        >
          <div className="z-10 flex flex-col gap-5 min-h-64 items-center justify-center">
            <div
              className={classnames(
                "group rounded-full border border-black/5 bg-neutral-100 text-base text-white transition-all ease-in hover:cursor-pointer hover:bg-neutral-200 dark:border-white/5 dark:bg-neutral-900 dark:hover:bg-neutral-800"
              )}
            >
              <AnimatedShinyText className="inline-flex items-center justify-center px-4 py-1 transition ease-out hover:text-neutral-600 hover:duration-300 hover:dark:text-neutral-400">
                <span>✨ {loadingModelProgress.loadingPart}</span>
              </AnimatedShinyText>
            </div>

            <SparklesText text={`${loadingModelProgress.percentage}%`} />
          </div>
        </div>
      )}

      <div
        className={classnames("flex-1 overflow-hidden z-20", {
          hidden: loadingModelProgress.progress !== 1,
        })}
      >
        <div className="container mx-auto h-full flex flex-col max-w-4xl  z-10">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {workerMessages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                } animate-fade-in`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl p-4 shadow-lg backdrop-blur-sm ${
                    message.role === "user"
                      ? "bg-blue-600 bg-opacity-90 text-white"
                      : message.role === "assistant"
                      ? "bg-gray-700 bg-opacity-90 text-gray-100"
                      : "bg-white bg-opacity-90 text-gray-800"
                  } transform transition-all duration-200 hover:scale-[1.02]`}
                >
                  <p className="text-sm leading-relaxed">
                    {message.content.toString()}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 flex flex-col gap-2">
            <form
              onSubmit={handleSubmit}
              className="flex flex-col space-y-5 w-full max-w-3xl"
            >
              <div className="flex">
                {selectedPDF && (
                  <div className="flex items-center gap-2 px-5 py-3 bg-gray-100 rounded">
                    <span className="text-sm truncate flex-1">
                      {selectedPDF.name}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-1 gap-2">
                <div className="relative flex w-full">
                  <Input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Skriv meldingen din..."
                    disabled={workerIsLoading}
                    className="h-14 px-5"
                  />

                  <label
                    htmlFor="file-upload"
                    className="absolute right-5 top-1/2 -translate-y-1/2 cursor-pointer"
                  >
                    <Input
                      type="file"
                      id="file-upload"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".pdf"
                      className="hidden"
                    />
                    <Paperclip className="h-5 w-5 text-gray-500 hover:text-gray-700" />
                  </label>
                </div>

                <InteractiveHoverButton
                  type="submit"
                  disabled={workerIsLoading}
                  text="Send"
                  iconComponent={<ArrowRight />}
                />
              </div>
            </form>
          </div>
        </div>
      </div>

      {isModelLoading && (
        <div className="z-10 flex flex-col gap-10 min-h-64 items-center justify-center">
          <TypingAnimation className="text-md text-gray-500">
            Det kan ta litt tid å laste modellen til nettleseren din, men når
            det er fullført, vil du kunne bruke den offline.
          </TypingAnimation>
          <AnimatedGradientText>
            ❤️ <hr className="mx-2 h-4 w-px shrink-0 bg-gray-300" />{" "}
            <span
              className={classnames(
                `inline animate-gradient bg-gradient-to-r from-[#ffaa40] via-[#9c40ff] to-[#ffaa40] bg-[length:var(--bg-size)_100%] bg-clip-text text-transparent`
              )}
            >
              Utviklet av ThuHuynh.no
            </span>
          </AnimatedGradientText>
        </div>
      )}

      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
      <RetroGrid />
    </div>
  );
}

export default App;
