import { useState, useRef } from 'react'
import { FaceSmileIcon, PaperClipIcon, MicrophoneIcon, PaperAirplaneIcon, StopIcon } from '@heroicons/react/24/solid'
import StickerPicker from './StickerPicker'

// eslint-disable-next-line react/prop-types
export default function MessageInput({ onSendMessage }) {
  const [inputText, setInputText] = useState('')
  const [showStickers, setShowStickers] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const fileInputRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const recordingIntervalRef = useRef(null)
  const audioChunksRef = useRef([])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!inputText.trim() || isSending) return
    setIsSending(true)
    try {
      const sent = await onSendMessage({ content: inputText.trim(), type: 'text' })
      if (sent) setInputText('')
    } finally {
      setIsSending(false)
    }
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || [])
    files.forEach(file => {
      const url = URL.createObjectURL(file)
      let type = 'file'

      if (file.type.startsWith('image/')) type = 'image'
      else if (file.type.startsWith('video/')) type = 'video'
      else if (file.type.startsWith('audio/')) type = 'voice'
      else if (
        file.type.includes('pdf') ||
        file.type.includes('document') ||
        file.type.includes('text') ||
        file.type.includes('spreadsheet') ||
        file.type.includes('presentation')
      ) type = 'file'

      onSendMessage({
        content: file.name,
        type,
        file_url: url,
        file_name: file.name,
        duration: type === 'voice' ? null : undefined,
      })
    })
    e.target.value = ''
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        onSendMessage({
          content: 'Voice message',
          type: 'voice',
          file_url: url,
          duration: recordingDuration,
        })
        stream.getTracks().forEach(track => track.stop())
        setRecordingDuration(0)
      }

      mediaRecorder.start()
      setIsRecording(true)
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)
    } catch {
      alert('Microphone access is required for voice messages')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    clearInterval(recordingIntervalRef.current)
    setIsRecording(false)
  }

  const handleStickerSelect = (sticker) => {
    onSendMessage({
      content: sticker.emoji,
      type: 'sticker',
    })
    setShowStickers(false)
  }

  return (
    <div className="bg-card border-t border-border px-3 sm:px-4 py-2 sm:py-3 relative flex-shrink-0">
      {/* Sticker Picker */}
      {showStickers && (
        <div className="absolute bottom-full left-0 right-0 mb-2">
          <StickerPicker
            onSelect={handleStickerSelect}
            onClose={() => setShowStickers(false)}
          />
        </div>
      )}

      {/* Recording State */}
      {isRecording ? (
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex-1 flex items-center gap-2 sm:gap-3 bg-destructive/10 px-3 sm:px-4 py-2 sm:py-3 rounded-full border border-destructive/20">
            <span className="w-2 h-2 sm:w-3 sm:h-3 bg-destructive rounded-full animate-pulse flex-shrink-0" />
            <span className="text-xs sm:text-sm text-destructive font-medium">
              Recording... {recordingDuration}s
            </span>
          </div>
          <button
            onClick={stopRecording}
            className="p-2 sm:p-3 bg-destructive hover:bg-destructive/90 rounded-full text-primary-foreground transition flex-shrink-0"
            title="Stop recording"
          >
            <StopIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      ) : (
        /* Normal Input State */
        <form onSubmit={handleSubmit} className="flex items-center gap-1 sm:gap-3">
          {/* Emoji Button */}
          <button
            type="button"
            onClick={() => setShowStickers(!showStickers)}
            className={`p-2 sm:p-2.5 rounded-full transition-colors flex-shrink-0 ${
              showStickers
                ? 'bg-primary/20 text-primary'
                : 'hover:bg-muted text-muted-foreground'
            }`}
            title="Stickers"
          >
            <FaceSmileIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          {/* File Upload Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 sm:p-2.5 hover:bg-muted rounded-full text-muted-foreground transition flex-shrink-0"
            title="Attach file"
          >
            <PaperClipIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Message Input */}
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={inputText}
              disabled={isSending}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type a message..."
              className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-muted border-none rounded-full text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition text-sm sm:text-base"
            />
          </div>

          {/* Send or Record Button */}
          {inputText.trim() ? (
            <button
              type="submit"
              disabled={isSending}
              className="p-2 sm:p-2.5 bg-primary hover:bg-primary/90 rounded-full text-primary-foreground transition flex-shrink-0"
              title="Send message"
            >
              <PaperAirplaneIcon className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              className="p-2 sm:p-2.5 bg-primary hover:bg-primary/90 rounded-full text-primary-foreground transition flex-shrink-0"
              title="Record voice message"
            >
              <MicrophoneIcon className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          )}
        </form>
      )}
    </div>
  )
}

