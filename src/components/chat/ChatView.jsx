/* eslint-disable react/prop-types */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { ArrowLeftIcon, PhoneIcon, LockClosedIcon } from '@heroicons/react/24/solid'
import Avatar from './Avatar'
import MessageInput from './MessageInput'
import MessageBubble from './MessageBubble'
import VoiceCallOverlay from './VoiceCallOverlay'
import { useSetting } from '../../hooks/useSetting'
import { getWallpaperById } from '../../lib/wallpapers'
import { encryptMessage, decryptMessage, isE2EEEnabled } from '../../lib/crypto/e2ee'
import { useVoiceCall } from '../../hooks/useVoiceCall'
import { sendChatMessage } from '../../lib/persistence'
import { isAppwriteDataAvailable, ID } from '../../lib/appwrite'
import { useAuth } from '../../lib/AuthContext'

// eslint-disable-next-line react/prop-types
export default function ChatView({ chat, onBack }) {
  const [messages, setMessages] = useState(chat?.messages || [])
  const [decryptedMessages, setDecryptedMessages] = useState({})
  const [sendError, setSendError] = useState('')
  const messagesEndRef = useRef(null)
  const [chatWallpaper] = useSetting('chatWallpaper', 'nature')
  const wallpaper = getWallpaperById(chatWallpaper)

  const voiceCall = useVoiceCall(chat.id)
  const { user } = useAuth()

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    setMessages(chat?.messages || [])
  }, [chat?.id, chat?.messages])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (!isE2EEEnabled()) return
    const pending = messages.filter((msg) => msg.encrypted && !decryptedMessages[msg.id])
    if (pending.length === 0) return

    const controller = { cancelled: false }
    ;(async () => {
      const results = await Promise.all(
        pending.map(async (msg) => {
          try {
            const decrypted = await decryptMessage(chat.id, msg.content, true)
            return { id: msg.id, decrypted }
          } catch {
            return { id: msg.id, decrypted: '🔒 Decryption failed' }
          }
        })
      )
      if (controller.cancelled) return
      setDecryptedMessages((prev) => {
        const next = { ...prev }
        for (const { id, decrypted } of results) {
          next[id] = decrypted
        }
        return next
      })
    })()

    return () => {
      controller.cancelled = true
    }
  }, [messages, chat.id, decryptedMessages])

  const handleSendMessage = useCallback(async (messageData) => {
    setSendError('')
    if (!user?.id) {
      setSendError('Sign in to send messages.')
      return false
    }
    if (!isAppwriteDataAvailable()) {
      setSendError('Message was not sent: the chat service is unavailable. Please try again when connected.')
      return false
    }

    let content = messageData.content || messageData
    const type = messageData.type || 'text'
    let encrypted = false

    if (isE2EEEnabled() && type === 'text') {
      try {
        const result = await encryptMessage(chat.id, content)
        content = result.content
        encrypted = result.encrypted
      } catch (error) {
        setSendError(error?.message || 'Could not encrypt this message.')
        return false
      }
    }

    const newMessage = {
      id: isAppwriteDataAvailable() ? ID.unique() : Date.now().toString(),
      sender_id: String(user.id),
      content,
      type,
      encrypted,
      file_url: messageData.file_url || null,
      file_name: messageData.file_name || null,
      duration: messageData.duration || null,
      created_at: new Date().toISOString(),
    }

    if (encrypted) {
      setDecryptedMessages((prev) => ({
        ...prev,
        [newMessage.id]: messageData.content || messageData,
      }))
    }

    try {
      await sendChatMessage(chat.id, newMessage)
      setMessages((prev) => prev.some((message) => message.id === newMessage.id) ? prev : [...prev, newMessage])
    } catch (error) {
      setSendError(error?.message || 'Message delivery failed. Please try again.')
      return false
    }
    return true
  }, [chat.id, user?.id])

  const wallpaperStyle = useMemo(() => (
    wallpaper.url
      ? {
          backgroundImage: `url(${wallpaper.url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'repeat',
        }
      : { background: wallpaper.preview || '#f3f4f6' }
  ), [wallpaper.url, wallpaper.preview])

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-background">
      <div className="bg-card border-b border-border px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={onBack}
            className="md:hidden p-2 hover:bg-muted rounded-full text-foreground flex-shrink-0"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div className="flex-shrink-0">
            <Avatar src={chat.avatar_url} alt={chat.title} size="sm" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <h2 className="font-bold text-foreground truncate text-sm sm:text-base">{chat.title}</h2>
              {(chat.encrypted || isE2EEEnabled()) && (
                <LockClosedIcon className="w-3.5 h-3.5 text-green-500 flex-shrink-0" title="End-to-end encrypted" />
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {voiceCall.callState === 'connected' ? 'On call' : 'Online'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <button
            onClick={voiceCall.initiateCall}
            disabled={voiceCall.callState !== 'idle'}
            className="p-2 hover:bg-muted rounded-full text-foreground disabled:opacity-50 transition"
            title="Start call"
          >
            <PhoneIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-w-0 relative" style={wallpaperStyle}>
        <div className="absolute inset-0 bg-card/60 dark:bg-background/70 pointer-events-none" />

        <div className="relative h-full flex flex-col">
          <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-3 sm:space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <p className="text-muted-foreground text-sm">No messages yet</p>
                  <p className="text-muted-foreground text-xs mt-1">Start a conversation</p>
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={{
                    ...message,
                    content: message.encrypted
                      ? (decryptedMessages[message.id] || '🔒 Decrypting...')
                      : message.content,
                  }}
                  isOwn={String(message.sender_id) === String(user?.id) || message.sender_id === 'me'}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {sendError && <p role="alert" className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">{sendError}</p>}
      <MessageInput onSendMessage={handleSendMessage} />

      <VoiceCallOverlay chat={chat} voiceCall={voiceCall} />

      <audio id="remote-audio" autoPlay />
    </div>
  )
}
