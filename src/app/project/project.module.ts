import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectHomeComponent } from './project-home.component';
import { ProjectHomeRouting } from './project-home.routing';

@NgModule({
  imports: [
    CommonModule,
    ProjectHomeRouting
  ],
  declarations: [ProjectHomeComponent]
})
export class ProjectModule { }
