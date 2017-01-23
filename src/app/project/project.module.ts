import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectHomeComponent } from './project-home.component';
import { ProjectCreateComponent } from './project-create.component';
import { ProjectRouting } from './project.routing';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ProjectRouting,
  ],
  declarations: [
    ProjectHomeComponent,
    ProjectCreateComponent
    ]
})
export class ProjectModule { }
