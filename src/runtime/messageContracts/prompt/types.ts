import type {
  PromptBody,
  PromptDraft,
  PromptMeta,
  PromptMetaDraft,
  PromptOrderGroup,
  PromptRecord,
} from '../../../prompt/schema';
import type { RuntimeMessageDescriptor } from '../../../shared/i18n';
import {
  CREATE_PROMPT_MESSAGE,
  DELETE_PROMPT_MESSAGE,
  GET_PROMPT_BODY_MESSAGE,
  GET_PROMPT_RECORD_MESSAGE,
  LIST_PROMPT_METAS_MESSAGE,
  MOVE_PROMPT_MESSAGE,
  SET_PROMPT_PINNED_MESSAGE,
  UPDATE_PROMPT_BODY_MESSAGE,
  UPDATE_PROMPT_META_MESSAGE,
  UPDATE_PROMPT_RECORD_MESSAGE,
} from './constants';

export type PromptMessageType =
  | typeof LIST_PROMPT_METAS_MESSAGE
  | typeof GET_PROMPT_BODY_MESSAGE
  | typeof GET_PROMPT_RECORD_MESSAGE
  | typeof CREATE_PROMPT_MESSAGE
  | typeof UPDATE_PROMPT_META_MESSAGE
  | typeof UPDATE_PROMPT_BODY_MESSAGE
  | typeof UPDATE_PROMPT_RECORD_MESSAGE
  | typeof DELETE_PROMPT_MESSAGE
  | typeof MOVE_PROMPT_MESSAGE
  | typeof SET_PROMPT_PINNED_MESSAGE;

export type ExistingPromptMessageType =
  | typeof GET_PROMPT_BODY_MESSAGE
  | typeof GET_PROMPT_RECORD_MESSAGE
  | typeof UPDATE_PROMPT_META_MESSAGE
  | typeof UPDATE_PROMPT_BODY_MESSAGE
  | typeof UPDATE_PROMPT_RECORD_MESSAGE
  | typeof DELETE_PROMPT_MESSAGE
  | typeof MOVE_PROMPT_MESSAGE
  | typeof SET_PROMPT_PINNED_MESSAGE;

export type PromptConflictMessageType =
  | PromptMetaConflictMessageType
  | PromptRecordConflictMessageType;

export type PromptMetaConflictMessageType =
  | typeof UPDATE_PROMPT_META_MESSAGE
  | typeof DELETE_PROMPT_MESSAGE
  | typeof MOVE_PROMPT_MESSAGE
  | typeof SET_PROMPT_PINNED_MESSAGE;

export type PromptRecordConflictMessageType =
  | typeof UPDATE_PROMPT_BODY_MESSAGE
  | typeof UPDATE_PROMPT_RECORD_MESSAGE;

export type ListPromptMetasRequest = {
  type: typeof LIST_PROMPT_METAS_MESSAGE;
};

export type GetPromptBodyRequest = {
  type: typeof GET_PROMPT_BODY_MESSAGE;
  id: string;
};

export type GetPromptRecordRequest = {
  type: typeof GET_PROMPT_RECORD_MESSAGE;
  id: string;
};

export type CreatePromptRequest = {
  type: typeof CREATE_PROMPT_MESSAGE;
  draft: PromptDraft;
};

export type UpdatePromptMetaRequest = {
  type: typeof UPDATE_PROMPT_META_MESSAGE;
  id: string;
  draft: PromptMetaDraft;
  expectedUpdatedAt: string;
};

export type UpdatePromptBodyRequest = {
  type: typeof UPDATE_PROMPT_BODY_MESSAGE;
  id: string;
  content: string;
  expectedUpdatedAt: string;
  expectedBodyUpdatedAt: string;
};

export type UpdatePromptRecordRequest = {
  type: typeof UPDATE_PROMPT_RECORD_MESSAGE;
  id: string;
  draft: PromptDraft;
  expectedUpdatedAt: string;
  expectedBodyUpdatedAt: string;
};

export type DeletePromptRequest = {
  type: typeof DELETE_PROMPT_MESSAGE;
  id: string;
  expectedUpdatedAt: string;
  expectedBodyUpdatedAt?: string;
};

export type MovePromptRequest = {
  type: typeof MOVE_PROMPT_MESSAGE;
  id: string;
  group?: PromptOrderGroup;
  previousId: string | null;
  nextId: string | null;
  expectedUpdatedAt: string;
};

export type SetPromptPinnedRequest = {
  type: typeof SET_PROMPT_PINNED_MESSAGE;
  id: string;
  pinned: boolean;
  expectedUpdatedAt: string;
};

export type PromptRequest =
  | ListPromptMetasRequest
  | GetPromptBodyRequest
  | GetPromptRecordRequest
  | CreatePromptRequest
  | UpdatePromptMetaRequest
  | UpdatePromptBodyRequest
  | UpdatePromptRecordRequest
  | DeletePromptRequest
  | MovePromptRequest
  | SetPromptPinnedRequest;

export type PromptMutationRequest =
  | CreatePromptRequest
  | UpdatePromptMetaRequest
  | UpdatePromptBodyRequest
  | UpdatePromptRecordRequest
  | DeletePromptRequest
  | MovePromptRequest
  | SetPromptPinnedRequest;

export type PromptErrorCode = 'storage-failed';

export type ListPromptMetasSuccessResponse = {
  type: typeof LIST_PROMPT_METAS_MESSAGE;
  ok: true;
  status: 'success';
  metas: PromptMeta[];
};

export type GetPromptBodySuccessResponse = {
  type: typeof GET_PROMPT_BODY_MESSAGE;
  ok: true;
  status: 'success';
  body: PromptBody;
};

export type GetPromptRecordSuccessResponse = {
  type: typeof GET_PROMPT_RECORD_MESSAGE;
  ok: true;
  status: 'success';
  prompt: PromptRecord;
};

export type CreatePromptSuccessResponse = {
  type: typeof CREATE_PROMPT_MESSAGE;
  ok: true;
  status: 'success';
  prompt: PromptRecord;
};

export type PromptMetaSuccessResponse<
  T extends
    | typeof UPDATE_PROMPT_META_MESSAGE
    | typeof MOVE_PROMPT_MESSAGE
    | typeof SET_PROMPT_PINNED_MESSAGE,
> = {
  type: T;
  ok: true;
  status: 'success';
  meta: PromptMeta;
};

export type UpdatePromptBodySuccessResponse = {
  type: typeof UPDATE_PROMPT_BODY_MESSAGE;
  ok: true;
  status: 'success';
  prompt: PromptRecord;
};

export type UpdatePromptRecordSuccessResponse = {
  type: typeof UPDATE_PROMPT_RECORD_MESSAGE;
  ok: true;
  status: 'success';
  prompt: PromptRecord;
};

export type DeletePromptSuccessResponse = {
  type: typeof DELETE_PROMPT_MESSAGE;
  ok: true;
  status: 'success';
  id: string;
};

export type PromptNotFoundResponse<T extends ExistingPromptMessageType> = {
  type: T;
  ok: false;
  status: 'not-found';
  id: string;
  message: string;
  messageDescriptor?: RuntimeMessageDescriptor;
};

export type PromptConflictBaseResponse<T extends PromptConflictMessageType> = {
  type: T;
  ok: false;
  status: 'conflict';
  id: string;
  message: string;
  messageDescriptor?: RuntimeMessageDescriptor;
  currentMeta: PromptMeta;
};

export type PromptMetaConflictResponse<T extends PromptMetaConflictMessageType> =
  PromptConflictBaseResponse<T>;

export type PromptRecordConflictResponse<T extends PromptRecordConflictMessageType> =
  PromptConflictBaseResponse<T> & {
    currentRecord: PromptRecord;
  };

export type PromptConflictResponse<T extends PromptConflictMessageType> =
  T extends PromptRecordConflictMessageType
    ? PromptRecordConflictResponse<T>
    : T extends PromptMetaConflictMessageType
      ? PromptMetaConflictResponse<T>
      : never;

export type PromptErrorResponse<T extends PromptMessageType> = {
  type: T;
  ok: false;
  status: 'error';
  code: PromptErrorCode;
  message: string;
  messageDescriptor?: RuntimeMessageDescriptor;
};

export type ListPromptMetasResponse =
  | ListPromptMetasSuccessResponse
  | PromptErrorResponse<typeof LIST_PROMPT_METAS_MESSAGE>;

export type GetPromptBodyResponse =
  | GetPromptBodySuccessResponse
  | PromptNotFoundResponse<typeof GET_PROMPT_BODY_MESSAGE>
  | PromptErrorResponse<typeof GET_PROMPT_BODY_MESSAGE>;

export type GetPromptRecordResponse =
  | GetPromptRecordSuccessResponse
  | PromptNotFoundResponse<typeof GET_PROMPT_RECORD_MESSAGE>
  | PromptErrorResponse<typeof GET_PROMPT_RECORD_MESSAGE>;

export type CreatePromptResponse =
  | CreatePromptSuccessResponse
  | PromptErrorResponse<typeof CREATE_PROMPT_MESSAGE>;

export type UpdatePromptMetaResponse =
  | PromptMetaSuccessResponse<typeof UPDATE_PROMPT_META_MESSAGE>
  | PromptNotFoundResponse<typeof UPDATE_PROMPT_META_MESSAGE>
  | PromptConflictResponse<typeof UPDATE_PROMPT_META_MESSAGE>
  | PromptErrorResponse<typeof UPDATE_PROMPT_META_MESSAGE>;

export type UpdatePromptBodyResponse =
  | UpdatePromptBodySuccessResponse
  | PromptNotFoundResponse<typeof UPDATE_PROMPT_BODY_MESSAGE>
  | PromptConflictResponse<typeof UPDATE_PROMPT_BODY_MESSAGE>
  | PromptErrorResponse<typeof UPDATE_PROMPT_BODY_MESSAGE>;

export type UpdatePromptRecordResponse =
  | UpdatePromptRecordSuccessResponse
  | PromptNotFoundResponse<typeof UPDATE_PROMPT_RECORD_MESSAGE>
  | PromptConflictResponse<typeof UPDATE_PROMPT_RECORD_MESSAGE>
  | PromptErrorResponse<typeof UPDATE_PROMPT_RECORD_MESSAGE>;

export type DeletePromptResponse =
  | DeletePromptSuccessResponse
  | PromptNotFoundResponse<typeof DELETE_PROMPT_MESSAGE>
  | PromptConflictResponse<typeof DELETE_PROMPT_MESSAGE>
  | PromptErrorResponse<typeof DELETE_PROMPT_MESSAGE>;

export type MovePromptResponse =
  | PromptMetaSuccessResponse<typeof MOVE_PROMPT_MESSAGE>
  | PromptNotFoundResponse<typeof MOVE_PROMPT_MESSAGE>
  | PromptConflictResponse<typeof MOVE_PROMPT_MESSAGE>
  | PromptErrorResponse<typeof MOVE_PROMPT_MESSAGE>;

export type SetPromptPinnedResponse =
  | PromptMetaSuccessResponse<typeof SET_PROMPT_PINNED_MESSAGE>
  | PromptNotFoundResponse<typeof SET_PROMPT_PINNED_MESSAGE>
  | PromptConflictResponse<typeof SET_PROMPT_PINNED_MESSAGE>
  | PromptErrorResponse<typeof SET_PROMPT_PINNED_MESSAGE>;

export type PromptResponse =
  | ListPromptMetasResponse
  | GetPromptBodyResponse
  | GetPromptRecordResponse
  | CreatePromptResponse
  | UpdatePromptMetaResponse
  | UpdatePromptBodyResponse
  | UpdatePromptRecordResponse
  | DeletePromptResponse
  | MovePromptResponse
  | SetPromptPinnedResponse;

export type PromptMutationResponse =
  | CreatePromptResponse
  | UpdatePromptMetaResponse
  | UpdatePromptBodyResponse
  | UpdatePromptRecordResponse
  | DeletePromptResponse
  | MovePromptResponse
  | SetPromptPinnedResponse;
