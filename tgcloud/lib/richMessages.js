import { SPLASH_IMAGE_URL } from './constants.js';

export function buildWelcomeRichMessage(copy) {
  return {
    blocks: [
      {
        type: 'photo',
        photo: {
          type: 'photo',
          media: SPLASH_IMAGE_URL,
        },
      },
      {
        type: 'heading',
        size: 1,
        text: copy.welcome.title,
      },
      {
        type: 'paragraph',
        text: copy.welcome.p1,
      },
      {
        type: 'paragraph',
        text: copy.welcome.p2,
      },
      {
        type: 'pre',
        text: 'npm install @tbridge/sdk # or pmpm add @tbridge/sdk',
        language: 'bash',
      },
      {
        type: 'footer',
        text: 'v0.4.2',
      },
    ],
  };
}
