import Component from '@glimmer/component';
import { service } from '@ember/service';
import { eq } from '../utils/helpers';
import QueueCard from './queue-card';
import AskUserQuestionCard from './ask-user-question-card';
import type ApprovalQueueService from '../services/approval-queue';
import AnimatedEach from 'ember-animated/components/animated-each';
import { fadeIn, fadeOut } from 'ember-animated/motions/opacity';
import move from 'ember-animated/motions/move';
import type TransitionContext from 'ember-animated/-private/transition-context';

function* cardTransition({
  insertedSprites,
  removedSprites,
  keptSprites,
  duration,
}: TransitionContext): Generator {
  yield Promise.all([
    ...removedSprites.map((s) => fadeOut(s, { duration })),
    ...keptSprites.map((s) => move(s)),
  ]);
  for (const sprite of insertedSprites) {
    void fadeIn(sprite, { duration });
  }
}

export default class ApprovalQueue extends Component {
  @service declare approvalQueue: ApprovalQueueService;

  cardTransition = cardTransition;

  get normalItems() {
    return this.approvalQueue.items.filter((i) => !i.snoozedToDesktop);
  }

  get snoozedItems() {
    return this.approvalQueue.items.filter((i) => i.snoozedToDesktop);
  }

  get hasNormalItems() {
    return this.normalItems.length > 0;
  }

  get hasSnoozedItems() {
    return this.snoozedItems.length > 0;
  }

  <template>
    <div class="column">
      <h1><span class="dot"></span>Approval Queue</h1>
      {{#if this.hasNormalItems}}
        <div id="queue">
          {{#AnimatedEach
            this.normalItems key="id" use=this.cardTransition duration=200
            as |item|
          }}
            {{#if (eq item.tool_name "AskUserQuestion")}}
              <AskUserQuestionCard @item={{item}} />
            {{else}}
              <QueueCard @item={{item}} />
            {{/if}}
          {{/AnimatedEach}}
        </div>
      {{else}}
        <div id="idle">No pending approvals</div>
      {{/if}}

      {{#if this.hasSnoozedItems}}
        <div id="for-review">
          <h2 class="for-review-heading">For Review</h2>
          <div id="for-review-list">
            {{#AnimatedEach
              this.snoozedItems key="id" use=this.cardTransition duration=200
              as |item|
            }}
              {{#if (eq item.tool_name "AskUserQuestion")}}
                <AskUserQuestionCard @item={{item}} />
              {{else}}
                <QueueCard @item={{item}} />
              {{/if}}
            {{/AnimatedEach}}
          </div>
        </div>
      {{/if}}
    </div>
  </template>
}
