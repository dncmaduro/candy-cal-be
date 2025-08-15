export class CreateTaskDefDto {
  code: string
  title: string
  roles: string[]
  order?: number
  autoComplete?: boolean // manual only
  type?: "manual" | "http"
  httpConfig?: {
    endpointKey: string
    runAt: string
    successStatus?: number
    successJsonPath?: string
    successEquals?: any
    autoCompleteOnSuccess?: boolean
    maxAttempts?: number
  }
}

export class UpdateTaskDefDto {
  title?: string
  roles?: string[]
  active?: boolean
  order?: number
  autoComplete?: boolean
  type?: "manual" | "http"
  httpConfig?: {
    endpointKey?: string
    runAt?: string
    successStatus?: number
    successJsonPath?: string
    successEquals?: any
    autoCompleteOnSuccess?: boolean
    maxAttempts?: number
  }
}

export class GenerateTasksDto {
  date?: string // YYYY-MM-DD
}

export class DailyTaskItemDto {
  code: string
  title: string
  status: "pending" | "done" | "auto" | "expired"
  completedAt?: Date
}

export class DailyTasksResponseDto {
  date: string
  tasks: DailyTaskItemDto[]
  summary: {
    total: number
    done: number
    auto: number
    pending: number
    expired: number
  }
}

// Aggregated per-user summary for all users endpoint
export class AllUsersDailyTasksItemDto {
  userId: string
  total: number
  done: number
}

export class AllUsersDailyTasksResponseDto {
  date: string
  items: AllUsersDailyTasksItemDto[]
}

export class TaskDefDto {
  code: string
  title: string
  roles: string[]
  active: boolean
  order: number
  autoComplete: boolean
  type: "manual" | "http"
  httpConfig?: {
    endpointKey: string
    runAt: string
    successStatus?: number
    successJsonPath?: string
    successEquals?: any
    autoCompleteOnSuccess: boolean
    maxAttempts: number
  }
  createdAt?: Date
  updatedAt?: Date
}
