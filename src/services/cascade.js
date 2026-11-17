// Suppressions en cascade : quand on supprime un parent, on supprime aussi ce qui en dépend.
import {
  Album,
  Carpool,
  Comment,
  Event,
  Group,
  Message,
  Photo,
  Poll,
  PollResponse,
  ShoppingItem,
  Thread,
  Ticket,
  TicketType,
} from '../models/index.js';

export async function deleteMessages(filter) {
  const messageIds = await Message.distinct('_id', filter);
  await Promise.all([
    Comment.deleteMany({ targetType: 'Message', target: { $in: messageIds } }),
    Message.deleteMany({ _id: { $in: messageIds } }),
  ]);
}

export async function deleteThreads(filter) {
  const threadIds = await Thread.distinct('_id', filter);
  await deleteMessages({ thread: { $in: threadIds } });
  await Thread.deleteMany({ _id: { $in: threadIds } });
}

export async function deletePhotos(filter) {
  const photoIds = await Photo.distinct('_id', filter);
  await Promise.all([
    Comment.deleteMany({ targetType: 'Photo', target: { $in: photoIds } }),
    Photo.deleteMany({ _id: { $in: photoIds } }),
  ]);
}

export async function deleteAlbum(albumId) {
  await deletePhotos({ album: albumId });
  await Album.deleteOne({ _id: albumId });
}

export async function deletePoll(pollId) {
  await Promise.all([PollResponse.deleteMany({ poll: pollId }), Poll.deleteOne({ _id: pollId })]);
}

export async function deleteEvent(eventId) {
  await Promise.all([
    deleteThreads({ event: eventId }),
    deletePhotos({ event: eventId }),
    Album.deleteMany({ event: eventId }),
    PollResponse.deleteMany({ event: eventId }),
    Poll.deleteMany({ event: eventId }),
    Ticket.deleteMany({ event: eventId }),
    TicketType.deleteMany({ event: eventId }),
    ShoppingItem.deleteMany({ event: eventId }),
    Carpool.deleteMany({ event: eventId }),
  ]);
  await Event.deleteOne({ _id: eventId });
}

export async function deleteGroup(groupId) {
  await Promise.all([
    deleteThreads({ group: groupId }),
    // Les événements du groupe sont conservés mais ne sont plus rattachés à un groupe.
    Event.updateMany({ group: groupId }, { $set: { group: null } }),
  ]);
  await Group.deleteOne({ _id: groupId });
}
