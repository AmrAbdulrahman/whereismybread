// Client-callable server actions for the /tags management page (the UI comes
// from @wib/ui's <LabelManager>). Server queries live in @wib/feature-tags/server.

export {
  saveTagAction,
  deleteTagAction,
  listTagsAction,
  type TagRow,
} from './lib/actions';
