import {RequestHandler} from 'express';

export type FileUploadHandler = RequestHandler;

export interface RequiredPermissions {
  roles?: string[];
  permissions?: string[];
}

export interface CurrentUser {
  id: string;
  email: string;
  phoneNumber: string;
  roles: string[];
  permissions: string[];
  scope?: string;
}
