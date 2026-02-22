
{{- define "mleAPI.name" -}}
{{- default .Chart.Name .Values.global.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}


{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "mleAPI.fullname" -}}
{{- $name := default .Chart.Name .Values.global.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "mleAPI.chart" -}}
{{- printf "%s-%s" .Chart.Name $.Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "mleAPI.labels" -}}
helm.sh/chart: {{ include "mleAPI.chart" . }}
{{ include "mleAPI.selectorLabels" . }}
{{- if $.Chart.AppVersion }}
app.kubernetes.io/version: {{ $.Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "mleAPI.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mleAPI.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: api
{{- end }}

{{/*
Queue fullname (API + queue suffix for DNS)
*/}}
{{- define "queue.fullname" -}}
{{- printf "%s-queue" (include "mleAPI.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Queue selector labels
*/}}
{{- define "queue.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mleAPI.name" . }}-queue
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: queue
{{- end }}

{{/*
Queue labels
*/}}
{{- define "queue.labels" -}}
helm.sh/chart: {{ include "mleAPI.chart" . }}
{{ include "queue.selectorLabels" . }}
{{- if $.Chart.AppVersion }}
app.kubernetes.io/version: {{ $.Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Redis fullname (API + redis suffix for DNS)
*/}}
{{- define "redis.fullname" -}}
{{- printf "%s-redis" (include "mleAPI.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Redis selector labels
*/}}
{{- define "redis.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mleAPI.name" . }}-redis
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: redis
{{- end }}

{{/*
Redis labels
*/}}
{{- define "redis.labels" -}}
helm.sh/chart: {{ include "mleAPI.chart" . }}
{{ include "redis.selectorLabels" . }}
{{- if $.Chart.AppVersion }}
app.kubernetes.io/version: {{ $.Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}