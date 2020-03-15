import {createEntityAdapter, EntityAdapter, EntityState} from '@ngrx/entity';
import {Project, ProjectBasicCfg} from '../project.model';
import {ProjectActions, ProjectActionTypes} from './project.actions';
import {createFeatureSelector, createSelector} from '@ngrx/store';
import {FIRST_PROJECT} from '../project.const';
import {sortWorklogDates} from '../../../util/sortWorklogDates';
import {JiraCfg} from '../../issue/providers/jira/jira.model';
import {GithubCfg} from '../../issue/providers/github/github.model';
import {BreakNr, BreakNrCopy, WorkContextType, WorkStartEnd} from '../../work-context/work-context.model';
import {AddTask, DeleteTask, TaskActionTypes} from '../../tasks/store/task.actions';
import {
  moveTaskDownInBacklogList,
  moveTaskDownInTodayList,
  moveTaskInBacklogList,
  moveTaskInTodayList,
  moveTaskToBacklogList,
  moveTaskToBacklogListAuto,
  moveTaskToTodayList,
  moveTaskToTodayListAuto,
  moveTaskUpInBacklogList,
  moveTaskUpInTodayList
} from '../../work-context/store/work-context-meta.actions';
import {moveItemInList, moveTaskForWorkContextLikeState} from '../../work-context/store/work-context-meta.helper';
import {filterOutId} from '../../tasks/store/task.reducer.util';
import {arrayMoveLeft, arrayMoveRight} from '../../../util/array-move';

export const PROJECT_FEATURE_NAME = 'projects';
const WORK_CONTEXT_TYPE: WorkContextType = WorkContextType.PROJECT;

export interface ProjectState extends EntityState<Project> {
  // additional entities state properties
  currentId: string | null;
  projectIdForLoadedRelatedData: string;
}

export const projectAdapter: EntityAdapter<Project> = createEntityAdapter<Project>();

// SELECTORS
// ---------
export const selectProjectFeatureState = createFeatureSelector<ProjectState>(PROJECT_FEATURE_NAME);
const {selectIds, selectEntities, selectAll, selectTotal} = projectAdapter.getSelectors();
export const selectCurrentProjectId = createSelector(selectProjectFeatureState, state => state.currentId);
export const selectAllProjects = createSelector(selectProjectFeatureState, selectAll);
export const selectUnarchivedProjects = createSelector(selectAllProjects, (projects) => projects.filter(p => !p.isArchived));
export const selectUnarchivedProjectsWithoutCurrent = createSelector(
  selectProjectFeatureState,
  (s) => {
    const ids = s.ids as string[];
    return ids.filter(id => id !== s.currentId).map(id => s.entities[id]).filter(p => !p.isArchived && p.id);
  },
);
export const selectArchivedProjects = createSelector(selectAllProjects, (projects) => projects.filter(p => p.isArchived));

export const selectIsRelatedDataLoadedForCurrentProject = createSelector(
  selectProjectFeatureState,
  (state): boolean => state.currentId === state.projectIdForLoadedRelatedData
);

export const selectCurrentProject = createSelector(selectProjectFeatureState,
  (state) => state.entities[state.currentId]
);
export const selectProjectIssueCfgs = createSelector(selectCurrentProject, (project) => project.issueIntegrationCfgs);

export const selectProjectJiraCfg = createSelector(selectProjectIssueCfgs, (issueProviderCfgs) => issueProviderCfgs && issueProviderCfgs.JIRA);
export const selectProjectThemeCfg = createSelector(selectCurrentProject, (project) => project.theme);
export const selectProjectJiraIsEnabled = createSelector(
  selectProjectJiraCfg,
  (jiraCfg: JiraCfg): boolean => jiraCfg && jiraCfg.isEnabled
);

export const selectProjectGithubCfg = createSelector(selectProjectIssueCfgs, (issueProviderCfgs) => issueProviderCfgs && issueProviderCfgs.GITHUB);
export const selectProjectGithubIsEnabled = createSelector(
  selectProjectGithubCfg,
  (gitCfg: GithubCfg): boolean => gitCfg && gitCfg.repo && gitCfg.repo.length > 2
);

export const selectAdvancedProjectCfg = createSelector(selectCurrentProject, (project) => project.advancedCfg);
export const selectProjectWorkStart = createSelector(selectCurrentProject, (project) => project.workStart);
export const selectProjectWorkEnd = createSelector(selectCurrentProject, (project) => project.workEnd);
export const selectProjectLastCompletedDay = createSelector(selectCurrentProject, (project): string => project.lastCompletedDay);
export const selectProjectBreakTime = createSelector(selectCurrentProject, (project) => project.breakTime);
export const selectProjectBreakNr = createSelector(selectCurrentProject, (project) => project.breakNr);
export const selectProjectBasicCfg = createSelector(selectCurrentProject, (project): ProjectBasicCfg => {
  const {advancedCfg, id, breakTime, workStart, workEnd, breakNr, ...basic} = project;
  return basic;
});

export const selectProjectLastWorkEnd = createSelector(
  selectProjectWorkEnd,
  (workEnd: WorkStartEnd): number => {
    if (!workEnd) {
      return;
    }
    const allDates = Object.keys(workEnd);
    const lastDate = sortWorklogDates(allDates)[allDates.length - 1];
    return workEnd[lastDate];
  }
);


// DYNAMIC SELECTORS
// -----------------
export const selectProjectById = createSelector(
  selectProjectFeatureState,
  (state, props: { id: string }) => state.entities[props.id]
);

export const selectProjectWorkStartForDay = createSelector(
  selectProjectWorkStart,
  (workStart: WorkStartEnd, props: { day: string }) => workStart[props.day]
);

export const selectProjectWorkEndForDay = createSelector(
  selectProjectWorkEnd,
  (workEnd: WorkStartEnd, props: { day: string }) => workEnd[props.day]
);

export const selectProjectBreakTimeForDay = createSelector(
  selectProjectBreakTime,
  (breakTime: BreakNr, props: { day: string }) => breakTime[props.day]
);

export const selectProjectBreakNrForDay = createSelector(
  selectProjectBreakNr,
  (breaks: BreakNrCopy, props: { day: string }) => breaks[props.day]
);


// DEFAULT
// -------
export const initialProjectState: ProjectState = projectAdapter.getInitialState({
  currentId: FIRST_PROJECT.id,
  ids: [
    FIRST_PROJECT.id
  ],
  entities: {
    [FIRST_PROJECT.id]: FIRST_PROJECT
  },
  projectIdForLoadedRelatedData: null,
});


// REDUCER
// -------
export function projectReducer(
  state: ProjectState = initialProjectState,
  action: ProjectActions | AddTask | DeleteTask
): ProjectState {
  // tslint:disable-next-line
  const payload = action['payload'];

  // TODO fix this hackyness once we use the new syntax everywhere
  if ((action.type as string) === moveTaskInTodayList.type) {
    const {taskId, newOrderedIds, target, workContextType, workContextId} = action as any;

    if (workContextType !== WORK_CONTEXT_TYPE) {
      return state;
    }

    const taskIdsBefore = state.entities[workContextId].taskIds;
    const taskIds = moveTaskForWorkContextLikeState(taskId, newOrderedIds, target, taskIdsBefore);
    return projectAdapter.updateOne({
      id: workContextId,
      changes: {
        taskIds
      }
    }, state);
  }

  if ((action.type as string) === moveTaskInBacklogList.type) {
    const {taskId, newOrderedIds, workContextId} = action as any;

    const taskIdsBefore = state.entities[workContextId].backlogTaskIds;
    const backlogTaskIds = moveTaskForWorkContextLikeState(taskId, newOrderedIds, null, taskIdsBefore);
    return projectAdapter.updateOne({
      id: workContextId,
      changes: {
        backlogTaskIds
      }
    }, state);
  }

  if ((action.type as string) === moveTaskToBacklogList.type) {
    const {taskId, newOrderedIds, workContextId} = action as any;

    const todaysTaskIdsBefore = state.entities[workContextId].taskIds;
    const backlogIdsBefore = state.entities[workContextId].backlogTaskIds;

    const filteredToday = todaysTaskIdsBefore.filter(filterOutId(taskId));
    const backlogTaskIds = moveItemInList(taskId, newOrderedIds, backlogIdsBefore);

    return projectAdapter.updateOne({
      id: workContextId,
      changes: {
        taskIds: filteredToday,
        backlogTaskIds,
      }
    }, state);
  }

  if ((action.type as string) === moveTaskToTodayList.type) {
    const {taskId, newOrderedIds, workContextId} = action as any;

    const backlogIdsBefore = state.entities[workContextId].backlogTaskIds;
    const todaysTaskIdsBefore = state.entities[workContextId].taskIds;

    const filteredBacklog = backlogIdsBefore.filter(filterOutId(taskId));
    const newTodaysTaskIds = moveItemInList(taskId, newOrderedIds, todaysTaskIdsBefore);

    return projectAdapter.updateOne({
      id: workContextId,
      changes: {
        taskIds: newTodaysTaskIds,
        backlogTaskIds: filteredBacklog,
      }
    }, state);
  }

  // up down today
  if ((action.type as string) === moveTaskUpInTodayList.type) {
    const {taskId, workContextType, workContextId} = action as any;
    return (workContextType === WORK_CONTEXT_TYPE)
      ? projectAdapter.updateOne({
        id: workContextId,
        changes: {
          taskIds: arrayMoveLeft(state.entities[workContextId].taskIds, taskId)
        }
      }, state)
      : state;
  }

  if ((action.type as string) === moveTaskDownInTodayList.type) {
    const {taskId, workContextType, workContextId} = action as any;
    return (workContextType === WORK_CONTEXT_TYPE)
      ? projectAdapter.updateOne({
        id: workContextId,
        changes: {
          taskIds: arrayMoveRight(state.entities[workContextId].taskIds, taskId)
        }
      }, state)
      : state;
  }

  // up down backlog
  if ((action.type as string) === moveTaskUpInBacklogList.type) {
    const {taskId, workContextId} = action as any;
    return projectAdapter.updateOne({
      id: workContextId,
      changes: {
        backlogTaskIds: arrayMoveLeft(state.entities[workContextId].backlogTaskIds, taskId)
      }
    }, state);
  }

  if ((action.type as string) === moveTaskDownInBacklogList.type) {
    const {taskId, workContextId} = action as any;
    return projectAdapter.updateOne({
      id: workContextId,
      changes: {
        backlogTaskIds: arrayMoveRight(state.entities[workContextId].backlogTaskIds, taskId)
      }
    }, state);
  }

  // AUTO move backlog/today
  if ((action.type as string) === moveTaskToBacklogListAuto.type) {
    const {taskId, workContextId} = action as any;
    const todaysTaskIdsBefore = state.entities[workContextId].taskIds;
    const backlogIdsBefore = state.entities[workContextId].backlogTaskIds;
    return (backlogIdsBefore.includes(taskId))
      ? state
      : projectAdapter.updateOne({
        id: workContextId,
        changes: {
          taskIds: todaysTaskIdsBefore.filter(filterOutId(taskId)),
          backlogTaskIds: [taskId, ...backlogIdsBefore],
        }
      }, state);
  }

  if ((action.type as string) === moveTaskToTodayListAuto.type) {
    const {taskId, workContextId, isMoveToTop} = action as any;
    const todaysTaskIdsBefore = state.entities[workContextId].taskIds;
    const backlogIdsBefore = state.entities[workContextId].backlogTaskIds;
    return (todaysTaskIdsBefore.includes(taskId))
      ? state
      : projectAdapter.updateOne({
        id: workContextId,
        changes: {
          backlogTaskIds: backlogIdsBefore.filter(filterOutId(taskId)),
          taskIds: (isMoveToTop)
            ? [taskId, ...todaysTaskIdsBefore]
            : [...todaysTaskIdsBefore, taskId]
        }
      }, state);
  }


  switch (action.type) {
    // Meta Actions
    // ------------
    case TaskActionTypes.AddTask: {
      const {workContextId, workContextType, task, isAddToBottom, isAddToBacklog} = payload;
      const affectedEntity = state.entities[workContextId];
      const prop: 'backlogTaskIds' | 'taskIds' = isAddToBacklog ? 'backlogTaskIds' : 'taskIds';

      return (workContextType === WORK_CONTEXT_TYPE)
        ? projectAdapter.updateOne({
          id: workContextId,
          changes: {
            [prop]: isAddToBottom
              ? [
                task.id,
                ...affectedEntity[prop]
              ]
              : [
                ...affectedEntity[prop],
                task.id,
              ]
          }
        }, state)
        : state;
    }

    case TaskActionTypes.DeleteTask: {
      const {task} = action.payload;
      const project = state.entities[task.projectId];
      return (task.projectId && (!task.subTaskIds || !task.subTaskIds.length))
        ? projectAdapter.updateOne({
          id: task.projectId,
          changes: {
            taskIds: project.taskIds.filter(ptId => ptId !== task.id),
            backlogTaskIds: project.taskIds.filter(ptId => ptId !== task.id)
          }
        }, state)
        : state;
    }


    // Project Actions
    // ------------
    case ProjectActionTypes.LoadProjectState: {
      return {...action.payload.state};
    }

    case ProjectActionTypes.LoadProjectRelatedDataSuccess: {
      return {
        ...state,
        projectIdForLoadedRelatedData: state.currentId,
      };
    }

    // TODO remove
    case ProjectActionTypes.SetCurrentProject: {
      return {
        ...state,
        currentId: payload,
      };
    }

    case ProjectActionTypes.AddProject: {
      return projectAdapter.addOne(payload.project, state);
    }

    case ProjectActionTypes.UpsertProject: {
      return projectAdapter.upsertOne(payload.project, state);
    }

    case ProjectActionTypes.AddProjects: {
      return projectAdapter.addMany(payload.projects, state);
    }

    case ProjectActionTypes.UpdateProject: {
      return projectAdapter.updateOne(payload.project, state);
    }

    case ProjectActionTypes.UpdateProjectWorkStart: {
      const {id, date, newVal} = action.payload;
      const oldP = state.entities[id];
      return projectAdapter.updateOne({
        id,
        changes: {
          workStart: {
            ...oldP.workStart,
            [date]: newVal,
          }
        }
      }, state);
    }

    case ProjectActionTypes.UpdateProjectWorkEnd: {
      const {id, date, newVal} = action.payload;
      const oldP = state.entities[id];
      return projectAdapter.updateOne({
        id,
        changes: {
          workEnd: {
            ...oldP.workEnd,
            [date]: newVal,
          }
        }
      }, state);
    }

    case ProjectActionTypes.UpdateLastCompletedDay: {
      const {id, date} = action.payload;
      return projectAdapter.updateOne({
        id,
        changes: {
          lastCompletedDay: date
        }
      }, state);
    }

    case ProjectActionTypes.AddToProjectBreakTime: {
      const {id, date, val} = action.payload;
      const oldP = state.entities[id];
      const oldBreakTime = oldP.breakTime[date] || 0;
      const oldBreakNr = oldP.breakNr[date] || 0;

      return projectAdapter.updateOne({
        id,
        changes: {
          breakNr: {
            ...oldP.breakNr,
            [date]: oldBreakNr + 1,
          },
          breakTime: {
            ...oldP.breakTime,
            [date]: oldBreakTime + val,
          }
        }
      }, state);
    }

    case ProjectActionTypes.DeleteProject: {
      return projectAdapter.removeOne(payload.id, state);
    }

    case ProjectActionTypes.DeleteProjects: {
      return projectAdapter.removeMany(payload.ids, state);
    }

    case ProjectActionTypes.LoadProjects: {
      return projectAdapter.addAll(payload.projects, state);
    }

    case ProjectActionTypes.UpdateProjectAdvancedCfg: {
      const {projectId, sectionKey, data} = payload;
      const currentProject = state.entities[projectId];
      const advancedCfg = Object.assign({}, currentProject.advancedCfg);
      return projectAdapter.updateOne({
        id: projectId,
        changes: {
          advancedCfg: {
            ...advancedCfg,
            [sectionKey]: {
              ...advancedCfg[sectionKey],
              ...data,
            }
          }
        }
      }, state);
    }

    case ProjectActionTypes.UpdateProjectIssueProviderCfg: {
      const {projectId, providerCfg, issueProviderKey, isOverwrite} = action.payload;
      const currentProject = state.entities[projectId];
      return projectAdapter.updateOne({
        id: projectId,
        changes: {
          issueIntegrationCfgs: {
            ...currentProject.issueIntegrationCfgs,
            [issueProviderKey]: {
              ...(isOverwrite ? {} : currentProject.issueIntegrationCfgs[issueProviderKey]),
              ...providerCfg,
            }
          }
        }
      }, state);
    }

    case ProjectActionTypes.UpdateProjectOrder: {
      return {...state, ids: action.payload.ids};
    }

    case ProjectActionTypes.ArchiveProject: {
      return projectAdapter.updateOne({
        id: action.payload.id,
        changes: {
          isArchived: true,
        }
      }, state);
    }

    case ProjectActionTypes.UnarchiveProject: {
      return projectAdapter.updateOne({
        id: action.payload.id,
        changes: {
          isArchived: false,
        }
      }, state);
    }

    default: {
      return state;
    }
  }
}
