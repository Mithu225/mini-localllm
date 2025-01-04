import { ChatWindowMessage } from "@/schema/ChatWindowMessage"
import { useEffect, useRef, useState } from "react"
import { Id, toast } from "react-toastify"

export const useLLMWorker = () => {
	const worker = useRef<Worker | null>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [messages, setMessages] = useState<ChatWindowMessage[]>([])
	const initProgressToastId = useRef<Id | null>(null);

	const handleLogMessage = (e: MessageEvent) => {
		setIsLoading(false)
		// toast(`${e.data.message}`)
	}

	const handleErrorMessage = (e: MessageEvent) => {
		setIsLoading(false)
		toast(`Error: ${e.data.error}`)
	}

	const handleInitProgressMessage = (e: MessageEvent) => {
		if (initProgressToastId.current === null) {
			initProgressToastId.current = toast(
				"Loading model weights... This may take a while",
				{
					progress: e.data.data.progress || 0.01,
					theme: "dark"
				}
			);
		} else {
			if (e.data.data.progress === 1) {
				new Promise((resolve) => setTimeout(resolve, 2000));
			}
			toast.update(initProgressToastId.current, { progress: e.data.data.progress || 0.01 });
		}
	}

	const handleCompleteMessage = (e: MessageEvent) => {
		console.log("Received complete message:", e.data);
		if (e.data.message) {
			setIsLoading(false)
			setMessages(prev => [...prev, e.data.message])
		} else {
			console.error("Received complete message without content:", e.data);
			toast("Received empty response from AI", { theme: "dark" });
		}
	}

	const unknonwEventType = (e: MessageEvent) => {
		console.error("Received unknown event type:", e.data);
		// toast("Received unknown event type");
	}

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
	}

	const postMessage = ({ type, messages, pdf }: { type: string, messages?: any, pdf?: Blob }) => {
		worker.current?.postMessage({ type, messages, pdf })
	}


	useEffect(() => {
		if (!worker.current) {
			worker.current = new Worker(new URL('../worker.ts', import.meta.url), {
				type: 'module',
			})

			worker.current.addEventListener('message', handleWorkerMessage)
		}

		return () => {
			worker.current?.removeEventListener('message', handleWorkerMessage)
		}
	}, [])

	return { worker, messages, isLoading, postMessage, setMessages, setIsLoading }

}