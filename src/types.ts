import {RequestHandler} from 'express-serve-static-core';

export type FileUploadHandler = RequestHandler;

export interface RequiredPermissions {
  roles?: string[];
  permissions?: string[];
  allowedScopes?: string[];
}

export interface CurrentUser {
  id: string;
  email?: string;
  phoneNumber?: string;
  phone?: string;
  roles: string[];
  permissions: string[];
  role?: string;
  scope?: string;
  merchantProfilesId?: string;
  isFirstTime?: boolean;
}
