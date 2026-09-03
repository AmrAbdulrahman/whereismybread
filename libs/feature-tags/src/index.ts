// Client-safe surface. Server queries live in @wib/feature-tags/server.

export { TagsManager } from './components/tags-manager';
export { TagForm } from './components/tag-form';
export {
  createTagAction,
  updateTagAction,
  deleteTagAction,
  listTagsAction,
} from './lib/actions';
export { tagFormSchema, type TagFormValues } from './lib/schema';
