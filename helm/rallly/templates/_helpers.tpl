{{/*
Helper template to define the PostgreSQL image based on user input
*/}}
{{- define "rallly.postgresImage" -}}
{{- default "postgres:15" .Values.postgres.image -}}
{{- end -}}

{{/*
Helper template to define the PostgreSQL password
*/}}
{{- define "rallly.postgresPassword" -}}
{{- default "postgres" .Values.postgres.password -}}
{{- end -}}

{{/*
Helper template to define the DATABASE_URL
*/}}
{{- define "rallly.databaseURL" -}}
{{- if .Values.postgres.external -}}
{{ .Values.postgres.externalDatabaseURL }}
{{- else -}}
postgres://postgres:{{ include "rallly.postgresql.postgresPassword" . }}@{{ .Release.Name }}-postgres:5432/{{ .Values.postgres.database }}
{{- end -}}
{{- end -}}

{{/*
Helper template to define the size of the persistent volume
*/}}
{{- define "rallly.pvcSize" -}}
{{- if .Values.persistence.enabled -}}
{{- default "1Gi" .Values.persistence.size -}}
{{- end -}}
{{- end -}}

{{/*
Helper template to define the Rallly full name
*/}}
{{- define "rallly.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Helper template to define the Rallly service name
*/}}
{{- define "rallly.name" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Helper template to define the chart name
*/}}
{{- define "rallly.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Helper template to define the default image tag
If the user does not provide a tag, it will default to the sctg/rallly:chart's app version
*/}}
{{- define "rallly.imageTag" -}}
{{- if .Values.image.tag -}}
{{- .Values.image.tag -}}
{{- else -}}
{{- printf "sctg/rallly:v%s" .Chart.AppVersion -}}
{{- end -}}
{{- end -}}
