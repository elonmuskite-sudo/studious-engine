export const APPWRITE_DATABASE_ID = '6aafb57c002d1184ead1'
export const APPWRITE_DATABASE_NAME = 'Nexus Chat'

export const MEMBER_ROLES = ['user', 'admin']

export const ADMIN_DEFAULTS = {
  memberId: '1000000000',
  firstName: 'System',
  lastName: 'Administrator',
  fullName: 'System Administrator',
  role: 'admin',
}

export const COLLECTION_PERMISSIONS = [
  'read("any")',
  'write("any")',
  'update("any")',
  'delete("any")',
]

export const NEXUS_COLLECTIONS = [
  {
    id: 'members',
    name: 'Members',
    attributes: [
      { key: 'member_id', type: 'string', size: 32, required: true },
      { key: 'first_name', type: 'string', size: 128, required: true },
      { key: 'last_name', type: 'string', size: 128, required: true },
      { key: 'full_name', type: 'string', size: 256, required: false },
      { key: 'password', type: 'string', size: 256, required: true },
      { key: 'email', type: 'string', size: 256, required: false },
      { key: 'email_verified', type: 'boolean', required: false, default: false },
      { key: 'role', type: 'string', size: 32, required: false, default: 'user' },
      { key: 'avatar_url', type: 'string', size: 2048, required: false },
      { key: 'created_at', type: 'datetime', required: false },
    ],
    indexes: [
      { key: 'idx_members_member_id', type: 'unique', attributes: ['member_id'] },
      { key: 'idx_members_email', type: 'key', attributes: ['email'] },
      { key: 'idx_members_role', type: 'key', attributes: ['role'] },
      { key: 'idx_members_created_at', type: 'key', attributes: ['created_at'] },
    ],
  },
  {
    id: 'profiles',
    name: 'Profiles',
    attributes: [
      { key: 'email', type: 'string', size: 256, required: true },
      { key: 'full_name', type: 'string', size: 256, required: false },
      { key: 'created_at', type: 'datetime', required: false },
    ],
    indexes: [
      { key: 'idx_profiles_email', type: 'unique', attributes: ['email'] },
    ],
  },
  {
    id: 'chats',
    name: 'Chats',
    attributes: [
      { key: 'title', type: 'string', size: 256, required: true },
      { key: 'type', type: 'string', size: 32, required: false, default: 'private' },
      { key: 'owner_id', type: 'string', size: 64, required: false },
      { key: 'created_at', type: 'datetime', required: false },
    ],
    indexes: [
      { key: 'idx_chats_created_at', type: 'key', attributes: ['created_at'] },
      { key: 'idx_chats_owner_id', type: 'key', attributes: ['owner_id'] },
    ],
  },
  {
    id: 'chat_members',
    name: 'Chat members',
    attributes: [
      { key: 'chat_id', type: 'string', size: 64, required: true },
      { key: 'profile_id', type: 'string', size: 64, required: true },
      { key: 'joined_at', type: 'datetime', required: false },
    ],
    indexes: [
      { key: 'idx_chat_members_pair', type: 'unique', attributes: ['chat_id', 'profile_id'] },
      { key: 'idx_chat_members_chat_id', type: 'key', attributes: ['chat_id'] },
      { key: 'idx_chat_members_profile_id', type: 'key', attributes: ['profile_id'] },
    ],
  },
  {
    id: 'messages',
    name: 'Messages',
    attributes: [
      { key: 'chat_id', type: 'string', size: 64, required: true },
      { key: 'sender_id', type: 'string', size: 64, required: false },
      { key: 'content', type: 'string', size: 65535, required: true },
      { key: 'type', type: 'string', size: 32, required: false, default: 'text' },
      { key: 'file_url', type: 'string', size: 2048, required: false },
      { key: 'file_name', type: 'string', size: 512, required: false },
      { key: 'encrypted', type: 'boolean', required: false, default: false },
      { key: 'created_at', type: 'datetime', required: false },
    ],
    indexes: [
      { key: 'idx_messages_chat_id', type: 'key', attributes: ['chat_id'] },
      { key: 'idx_messages_created_at', type: 'key', attributes: ['created_at'] },
    ],
  },
]
